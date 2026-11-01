from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, text, union
from sqlalchemy.orm import Session

from app.auth import require_role
from app.config import get_settings
from app.database import get_db
from app.models import Assessment, MoodLog, PomodoroSession, Post, PostReport, User, WellnessSession
from app.models.views import v_campus_daily_mood as campus_mood
from app.schemas.admin import (
    AdminUserOut,
    AdminUserUpdate,
    DepartmentMoodDay,
    Overview,
    Role,
    SeveritySummary,
)
from app.schemas.user import Department
from app.utils import local_today

router = APIRouter(prefix="/api", tags=["admin"])

# groups smaller than this are hidden so individual students cannot be identified
# (same rule as the v_campus_daily_mood view)
MIN_GROUP_SIZE = 5
SEVERITIES = ("minimal", "mild", "moderate", "moderately_severe", "severe")


@router.get("/admin/users", response_model=list[AdminUserOut])
def list_users(
    role: Role | None = None,
    department: Department | None = None,
    is_active: bool | None = None,
    search: str | None = Query(default=None, description="part of the name or email"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> list[User]:
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if department:
        query = query.where(User.department == department)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(User.name.ilike(pattern), User.email.ilike(pattern)))
    return list(db.scalars(query.order_by(User.name).limit(limit).offset(offset)))


@router.patch("/admin/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> User:
    """Deactivate / reactivate an account, change its role or department."""
    if user_id == admin.user_id:
        # prevents an admin from locking themselves (and possibly everyone) out
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="cannot_change_own_account")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")

    changes = body.model_dump(exclude_unset=True)
    if changes.get("role") is None:
        changes.pop("role", None)
    if changes.get("is_active") is None:
        changes.pop("is_active", None)
    role = changes.get("role", user.role)
    department = changes.get("department", user.department)
    if role == "student" and department is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="student_needs_department")

    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.get("/admin/overview", response_model=Overview)
def overview(admin: User = Depends(require_role("admin")), db: Session = Depends(get_db)) -> Overview:
    """Numbers for the admin dashboard."""
    roles = dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent = union(
        select(MoodLog.user_id).where(MoodLog.logged_at >= week_ago),
        select(PomodoroSession.user_id).where(PomodoroSession.completed_at >= week_ago),
        select(WellnessSession.user_id).where(WellnessSession.ended_at >= week_ago),
        select(Assessment.user_id).where(Assessment.taken_at >= week_ago),
    ).subquery()
    active = db.scalar(
        select(func.count()).select_from(User)
        .where(User.role == "student", User.user_id.in_(select(recent.c.user_id)))
    )
    return Overview(
        students=roles.get("student", 0),
        admins=roles.get("admin", 0),
        counsellors=roles.get("counsellor", 0),
        deactivated_users=db.scalar(select(func.count()).where(User.is_active.is_(False))),
        active_students_7d=active,
        pending_posts=db.scalar(select(func.count()).where(Post.status == "pending")),
        open_reports=db.scalar(select(func.count()).where(PostReport.status == "open")),
    )


@router.get("/counsellor/mood-trends", response_model=list[DepartmentMoodDay], tags=["counsellor"])
def mood_trends(
    days: int = Query(default=30, ge=1, le=365),
    department: Department | None = None,
    staff: User = Depends(require_role("counsellor", "admin")),
    db: Session = Depends(get_db),
) -> list[DepartmentMoodDay]:
    """Anonymized daily mood per department (Table 4.21). No user ids, private logs excluded,
    and days where fewer than 5 students of a department logged are left out."""
    since = local_today() - timedelta(days=days - 1)
    query = select(campus_mood).where(campus_mood.c.day >= since)
    if department:
        query = query.where(campus_mood.c.department == department)
    rows = db.execute(query.order_by(campus_mood.c.day, campus_mood.c.department)).all()
    return [DepartmentMoodDay.model_validate(row._asdict()) for row in rows]


@router.get("/counsellor/assessment-summary", response_model=list[SeveritySummary], tags=["counsellor"])
def assessment_summary(
    days: int = Query(default=30, ge=1, le=365),
    staff: User = Depends(require_role("counsellor", "admin")),
    db: Session = Depends(get_db),
) -> list[SeveritySummary]:
    """How many students per department fall in each severity band, using each student's
    latest PHQ-9 / GAD-7 in the period. Groups of fewer than 5 students are left out."""
    tz = ZoneInfo(get_settings().timezone)
    since = datetime.combine(local_today() - timedelta(days=days - 1), datetime.min.time(), tz)
    rows = db.execute(
        text("""
            WITH latest AS (
                SELECT DISTINCT ON (r.user_id, r.assessment_type)
                       u.department, r.assessment_type, r.severity
                FROM v_assessment_results r
                JOIN users u ON u.user_id = r.user_id
                WHERE u.role = 'student' AND r.taken_at >= :since
                ORDER BY r.user_id, r.assessment_type, r.taken_at DESC
            )
            SELECT department, assessment_type, severity, COUNT(*) AS students
            FROM latest
            GROUP BY department, assessment_type, severity
        """),
        {"since": since},
    ).all()

    groups: dict[tuple[str, str], dict[str, int]] = {}
    for department, kind, severity, count in rows:
        if (department, kind) not in groups:
            # "moderately_severe" exists only for PHQ-9
            groups[(department, kind)] = {
                s: 0 for s in SEVERITIES if kind == "PHQ9" or s != "moderately_severe"
            }
        groups[(department, kind)][severity] = count
    return [
        SeveritySummary(department=d, assessment_type=k, students=sum(b.values()), severity=b)
        for (d, k), b in sorted(groups.items())
        if sum(b.values()) >= MIN_GROUP_SIZE
    ]
