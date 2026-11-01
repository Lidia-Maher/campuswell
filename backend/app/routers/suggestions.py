"""FR-11 (optional): personalised, non-clinical tips chosen by simple rules from the user's
recent data. model_version records which rule set chose each tip, so a future ML model
can be compared with the rules using the was_helpful feedback."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_role
from app.database import get_db
from app.models import (
    MoodLog,
    PomodoroSession,
    SuggestionTemplate,
    Task,
    User,
    UserSuggestion,
    WellnessSession,
)
from app.models.views import v_assessment_results as results
from app.schemas.assessment import RECOMMEND_COUNSELLING
from app.schemas.suggestion import (
    SuggestionFeedback,
    SuggestionOut,
    TemplateCreate,
    TemplateOut,
    TemplateUpdate,
)
from app.utils import get_own_or_404, local_day, local_today

router = APIRouter(prefix="/api", tags=["suggestions"])

MODEL_VERSION = "rules-v1"


def choose_category(db: Session, user: User) -> tuple[str, str]:
    """The first rule that matches wins. Returns (category, reason shown to the user)."""
    now = datetime.now(timezone.utc)
    today = local_today()

    latest = db.execute(
        select(results.c.severity, results.c.needs_support_message)
        .where(results.c.user_id == user.user_id, results.c.taken_at >= now - timedelta(days=14))
        .order_by(results.c.taken_at.desc())
        .limit(1)
    ).first()
    if latest and (latest.needs_support_message or latest.severity in RECOMMEND_COUNSELLING):
        return "support", "Based on your recent questionnaire."

    recent_mood = db.scalar(
        select(func.avg(MoodLog.mood)).where(
            MoodLog.user_id == user.user_id, local_day(MoodLog.logged_at) >= today - timedelta(days=2)
        )
    )
    if recent_mood is not None and recent_mood <= 2.5:
        return "mood", "Your mood has been low the last few days."

    focus_today = db.scalar(
        select(func.coalesce(func.sum(PomodoroSession.duration_minutes), 0)).where(
            PomodoroSession.user_id == user.user_id, local_day(PomodoroSession.completed_at) == today
        )
    )
    if focus_today >= 180:
        return "rest", f"You have focused for {focus_today} minutes today."

    overdue = db.scalar(
        select(func.count()).where(
            Task.user_id == user.user_id,
            Task.status.in_(("pending", "in-progress")),
            Task.due_date < today,
        )
    )
    if overdue >= 2:
        return "study", f"You have {overdue} overdue tasks."

    practised = db.scalar(
        select(func.count()).where(
            WellnessSession.user_id == user.user_id, WellnessSession.ended_at >= now - timedelta(days=7)
        )
    )
    if practised == 0:
        return "wellness", "You have not done a wellness exercise this week."

    return "study", "A tip to keep your good routine going."


def _pick_template(db: Session, user: User, category: str) -> SuggestionTemplate | None:
    """The tip in this category the user has not seen for the longest time (never seen first)."""
    last_shown = (
        select(func.max(UserSuggestion.shown_at))
        .where(UserSuggestion.template_id == SuggestionTemplate.template_id,
               UserSuggestion.user_id == user.user_id)
        .correlate(SuggestionTemplate)
        .scalar_subquery()
    )
    query = select(SuggestionTemplate).where(SuggestionTemplate.is_active)
    order = (last_shown.asc().nulls_first(), SuggestionTemplate.template_id)
    return (
        db.scalars(query.where(SuggestionTemplate.category == category).order_by(*order)).first()
        or db.scalars(query.order_by(*order)).first()  # no tip in that category: any tip
    )


def _out(s: UserSuggestion, t: SuggestionTemplate, reason: str | None = None) -> SuggestionOut:
    return SuggestionOut(suggestion_id=s.suggestion_id, category=t.category, message=t.message,
                         reason=reason, was_helpful=s.was_helpful, shown_at=s.shown_at)


@router.get("/suggestions/today", response_model=SuggestionOut)
def todays_suggestion(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SuggestionOut:
    """One tip per day for the dashboard. Calling again the same day returns the same tip."""
    category, reason = choose_category(db, user)
    existing = db.execute(
        select(UserSuggestion, SuggestionTemplate)
        .join(SuggestionTemplate)
        .where(UserSuggestion.user_id == user.user_id,
               local_day(UserSuggestion.shown_at) == local_today())
        .order_by(UserSuggestion.shown_at.desc())
        .limit(1)
    ).first()
    # a new support need during the day replaces the earlier tip
    if existing and not (category == "support" and existing[1].category != "support"):
        return _out(*existing)

    template = _pick_template(db, user, category)
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no_suggestions_available")
    suggestion = UserSuggestion(user_id=user.user_id, template_id=template.template_id,
                                model_version=MODEL_VERSION)
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)
    return _out(suggestion, template, reason if template.category == category else None)


@router.get("/suggestions", response_model=list[SuggestionOut])
def suggestion_history(
    limit: int = Query(default=30, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SuggestionOut]:
    rows = db.execute(
        select(UserSuggestion, SuggestionTemplate)
        .join(SuggestionTemplate)
        .where(UserSuggestion.user_id == user.user_id)
        .order_by(UserSuggestion.shown_at.desc())
        .limit(limit)
    ).all()
    return [_out(s, t) for s, t in rows]


@router.post("/suggestions/{suggestion_id}/feedback", response_model=SuggestionOut)
def suggestion_feedback(
    suggestion_id: int,
    body: SuggestionFeedback,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuggestionOut:
    """The answer to "Was this helpful?" (yes / no). Can be changed later."""
    suggestion = get_own_or_404(db, UserSuggestion, suggestion_id, user)
    suggestion.was_helpful = body.was_helpful
    db.commit()
    return _out(suggestion, db.get(SuggestionTemplate, suggestion.template_id))


# ---- admin: manage the tips ----

@router.get("/admin/suggestion-templates", response_model=list[TemplateOut], tags=["admin"])
def list_templates(
    admin: User = Depends(require_role("admin")), db: Session = Depends(get_db)
) -> list[SuggestionTemplate]:
    query = select(SuggestionTemplate).order_by(SuggestionTemplate.category, SuggestionTemplate.template_id)
    return list(db.scalars(query))


@router.post("/admin/suggestion-templates", response_model=TemplateOut,
             status_code=status.HTTP_201_CREATED, tags=["admin"])
def create_template(
    body: TemplateCreate, admin: User = Depends(require_role("admin")), db: Session = Depends(get_db)
) -> SuggestionTemplate:
    template = SuggestionTemplate(**body.model_dump())
    template.message = template.message.strip()
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.patch("/admin/suggestion-templates/{template_id}", response_model=TemplateOut, tags=["admin"])
def update_template(
    template_id: int,
    body: TemplateUpdate,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> SuggestionTemplate:
    """Tips are never deleted (past suggestions refer to them); deactivate them instead."""
    template = db.get(SuggestionTemplate, template_id)
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(template, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(template)
    return template
