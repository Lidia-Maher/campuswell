from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import TokenClaims, check_email_allowed, get_current_user, get_token_claims
from app.database import get_db
from app.models import (
    Assessment,
    MoodLog,
    PomodoroSession,
    Post,
    Reminder,
    Task,
    User,
    UserSuggestion,
    WellnessContent,
    WellnessSession,
)
from app.schemas.user import UserOut, UserRegister, UserUpdate

router = APIRouter(prefix="/api/me", tags=["account"])


@router.get("", response_model=UserOut)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """Call right after Firebase login. 403 'not_registered' means: show the registration screen."""
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return user


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    body: UserRegister,
    claims: TokenClaims = Depends(get_token_claims),
    db: Session = Depends(get_db),
) -> User:
    """First-time registration after Firebase login: name, department and consent.
    The email must be verified and end in an allowed university domain."""
    if claims.email is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="email_required")
    check_email_allowed(claims)
    if db.scalar(select(User).where(User.firebase_uid == claims.uid)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_registered")
    if db.scalar(select(User).where(User.email == claims.email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email_in_use")

    now = datetime.now(timezone.utc)
    user = User(
        firebase_uid=claims.uid,
        email=claims.email,
        name=body.name.strip(),
        department=body.department,
        consent_accepted_at=now,
        last_login_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("", response_model=UserOut)
def update_me(
    body: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(user)
    return user


@router.get("/export")
def export_my_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """All of the user's data as JSON (GP1 Settings: "Export your data")."""
    def rows(model, order):
        return [
            {c.name: getattr(r, c.key) for c in model.__table__.columns if c.name != "user_id"}
            for r in db.scalars(select(model).where(model.user_id == user.user_id).order_by(order))
        ]

    assessments = [
        {
            "assessment_id": a.assessment_id,
            "type": a.assessment_type,
            "taken_at": a.taken_at,
            "answers": [r.score for r in a.responses],
        }
        for a in db.scalars(select(Assessment).where(Assessment.user_id == user.user_id).order_by(Assessment.taken_at))
    ]
    wellness = [
        {"content": title, "category": category, "duration_seconds": s.duration_seconds,
         "is_completed": s.is_completed, "started_at": s.started_at, "ended_at": s.ended_at}
        for s, title, category in db.execute(
            select(WellnessSession, WellnessContent.title, WellnessContent.category)
            .join(WellnessContent).where(WellnessSession.user_id == user.user_id).order_by(WellnessSession.ended_at)
        )
    ]
    return {
        "exported_at": datetime.now(timezone.utc),
        "profile": UserOut.model_validate(user).model_dump(),
        "consent_accepted_at": user.consent_accepted_at,
        "mood_logs": rows(MoodLog, MoodLog.logged_at),
        "tasks": rows(Task, Task.created_at),
        "pomodoro_sessions": rows(PomodoroSession, PomodoroSession.started_at),
        "wellness_sessions": wellness,
        "assessments": assessments,
        "posts": rows(Post, Post.created_at),
        "reminders": rows(Reminder, Reminder.reminder_type),
    }


@router.delete("/data", status_code=status.HTTP_204_NO_CONTENT)
def erase_my_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    """Deletes the tracked history (moods, tasks, focus and wellness sessions, questionnaires,
    tips shown) but keeps the account, community posts and reminder settings."""
    for model in (MoodLog, PomodoroSession, Task, WellnessSession, Assessment, UserSuggestion):
        db.execute(delete(model).where(model.user_id == user.user_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    """Deletes the account and ALL personal data (ON DELETE CASCADE).
    The frontend should then delete the Firebase account with user.delete()."""
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
