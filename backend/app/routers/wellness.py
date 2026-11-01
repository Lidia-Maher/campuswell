from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_role
from app.database import get_db
from app.models import User, WellnessContent, WellnessSession
from app.schemas.wellness import (
    Category,
    CategoryMinutes,
    ContentCreate,
    ContentOut,
    ContentUpdate,
    SessionCreate,
    SessionOut,
    WellnessStats,
)
from app.utils import local_day, local_today

router = APIRouter(prefix="/api/wellness", tags=["wellness"])


def _content_or_404(db: Session, content_id: int, user: User) -> WellnessContent:
    """Students only see active content; admins also see deactivated content."""
    content = db.get(WellnessContent, content_id)
    if content is None or (not content.is_active and user.role != "admin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return content


def _session_out(s: WellnessSession, title: str, category: str) -> SessionOut:
    return SessionOut(
        session_id=s.session_id, content_id=s.content_id, content_title=title,
        category=category, duration_seconds=s.duration_seconds, is_completed=s.is_completed,
        started_at=s.started_at, ended_at=s.ended_at,
    )


@router.get("/content", response_model=list[ContentOut])
def list_content(
    category: Category | None = None,
    include_inactive: bool = Query(default=False, description="admins only"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WellnessContent]:
    """FR-06, FR-07: the library of meditations, breathing exercises and sleep sounds."""
    query = select(WellnessContent)
    if not (include_inactive and user.role == "admin"):
        query = query.where(WellnessContent.is_active)
    if category:
        query = query.where(WellnessContent.category == category)
    return list(db.scalars(query.order_by(WellnessContent.category, WellnessContent.title)))


@router.get("/content/{content_id}", response_model=ContentOut)
def get_content(
    content_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> WellnessContent:
    return _content_or_404(db, content_id, user)


@router.post("/content", response_model=ContentOut, status_code=status.HTTP_201_CREATED)
def create_content(
    body: ContentCreate,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> WellnessContent:
    content = WellnessContent(created_by=admin.user_id, **body.model_dump())
    db.add(content)
    db.commit()
    db.refresh(content)
    return content


@router.patch("/content/{content_id}", response_model=ContentOut)
def update_content(
    content_id: int,
    body: ContentUpdate,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> WellnessContent:
    """Content is never deleted (past sessions refer to it); deactivate it instead."""
    content = _content_or_404(db, content_id, admin)
    current = ContentOut.model_validate(content).model_dump(exclude={"content_id"})
    merged = {**current, **body.model_dump(exclude_unset=True)}
    try:
        checked = ContentCreate.model_validate(merged)  # same rules as when creating
    except ValidationError as e:
        raise RequestValidationError(e.errors(include_url=False))
    for field, value in checked.model_dump().items():
        setattr(content, field, value)
    db.commit()
    db.refresh(content)
    return content


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def log_session(
    body: SessionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SessionOut:
    """Save a meditation / breathing session when it ends."""
    content = _content_or_404(db, body.content_id, user)
    session = WellnessSession(user_id=user.user_id, **body.model_dump(exclude_none=True))
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_out(session, content.title, content.category)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    limit: int = Query(default=50, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SessionOut]:
    """The user's wellness sessions, newest first."""
    rows = db.execute(
        select(WellnessSession, WellnessContent.title, WellnessContent.category)
        .join(WellnessContent)
        .where(WellnessSession.user_id == user.user_id)
        .order_by(WellnessSession.ended_at.desc())
        .limit(limit)
    ).all()
    return [_session_out(s, title, category) for s, title, category in rows]


@router.get("/stats", response_model=WellnessStats)
def wellness_stats(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WellnessStats:
    since = local_today() - timedelta(days=days - 1)
    day = local_day(WellnessSession.ended_at)
    mine = (WellnessSession.user_id == user.user_id, day >= since)

    by_category = db.execute(
        select(WellnessContent.category, func.count(), func.sum(WellnessSession.duration_seconds))
        .join(WellnessContent)
        .where(*mine)
        .group_by(WellnessContent.category)
        .order_by(WellnessContent.category)
    ).all()
    days_practised = db.scalar(select(func.count(func.distinct(day))).where(*mine))
    last = db.scalar(
        select(func.max(local_day(WellnessSession.ended_at))).where(
            WellnessSession.user_id == user.user_id
        )
    )
    categories = [
        CategoryMinutes(category=c, sessions=n, minutes=round(int(secs) / 60, 1))
        for c, n, secs in by_category
    ]
    return WellnessStats(
        days=days,
        sessions=sum(c.sessions for c in categories),
        minutes=round(sum(c.minutes for c in categories), 1),
        days_practised=days_practised,
        by_category=categories,
        last_session_on=last,
    )
