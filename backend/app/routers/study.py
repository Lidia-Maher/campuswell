from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, nulls_last, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import PomodoroSession, Task, User
from app.schemas.study import (
    DailyStudy,
    PomodoroCreate,
    PomodoroOut,
    StudyStats,
    TaskCreate,
    TaskOut,
    TaskStatus,
    TaskUpdate,
)
from app.utils import get_own_or_404, local_day, local_today

router = APIRouter(prefix="/api", tags=["study"])

OPEN_STATUSES = ("pending", "in-progress")


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    body: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Task:
    """FR-05: add a task with priority and optional due date."""
    task = Task(user_id=user.user_id, **body.model_dump())
    task.title = task.title.strip()
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    overdue: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Task]:
    """The user's tasks: soonest due date first (no due date last), high priority first."""
    query = select(Task).where(Task.user_id == user.user_id)
    if status_filter:
        query = query.where(Task.status == status_filter)
    if overdue:
        query = query.where(Task.status.in_(OPEN_STATUSES), Task.due_date < local_today())
    priority_order = case({"high": 0, "medium": 1, "low": 2}, value=Task.priority)
    query = query.order_by(nulls_last(Task.due_date.asc()), priority_order, Task.created_at.desc())
    return list(db.scalars(query))


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Task:
    return get_own_or_404(db, Task, task_id, user)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    body: TaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    """Edit a task or change its status. completed_at is set and cleared automatically."""
    task = get_own_or_404(db, Task, task_id, user)
    changes = body.model_dump(exclude_unset=True)
    for field in ("title", "priority", "status"):
        if field in changes and changes[field] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"{field}_required")

    if "status" in changes and changes["status"] != task.status:
        task.completed_at = datetime.now(timezone.utc) if changes["status"] == "completed" else None
    for field, value in changes.items():
        setattr(task, field, value.strip() if field == "title" else value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    """Pomodoro sessions linked to the task are kept (their task_id becomes empty)."""
    db.delete(get_own_or_404(db, Task, task_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/pomodoro", response_model=PomodoroOut, status_code=status.HTTP_201_CREATED)
def log_pomodoro(
    body: PomodoroCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PomodoroSession:
    """FR-04: save a Pomodoro session when it ends."""
    if body.task_id is not None:
        get_own_or_404(db, Task, body.task_id, user)
    values = body.model_dump(exclude_none=True)
    session = PomodoroSession(user_id=user.user_id, **values)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/pomodoro", response_model=list[PomodoroOut])
def list_pomodoro(
    start: date | None = None,
    end: date | None = None,
    task_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PomodoroSession]:
    """The user's Pomodoro sessions, newest first. start/end are inclusive dates."""
    query = select(PomodoroSession).where(PomodoroSession.user_id == user.user_id)
    if start:
        query = query.where(local_day(PomodoroSession.completed_at) >= start)
    if end:
        query = query.where(local_day(PomodoroSession.completed_at) <= end)
    if task_id is not None:
        query = query.where(PomodoroSession.task_id == task_id)
    query = query.order_by(PomodoroSession.completed_at.desc()).limit(limit)
    return list(db.scalars(query))


@router.get("/study/stats", response_model=StudyStats)
def study_stats(
    days: int = Query(default=7, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyStats:
    """FR-09: focus minutes and completed tasks per day, plus current open/overdue tasks."""
    today = local_today()
    since = today - timedelta(days=days - 1)

    p_day = local_day(PomodoroSession.completed_at)
    focus_rows = db.execute(
        select(
            p_day,
            func.sum(PomodoroSession.duration_minutes),
            func.count().filter(PomodoroSession.status == "completed"),
            func.count().filter(PomodoroSession.status == "cancelled"),
        )
        .where(PomodoroSession.user_id == user.user_id, p_day >= since)
        .group_by(p_day)
    ).all()

    t_day = local_day(Task.completed_at)
    done_rows = db.execute(
        select(t_day, func.count())
        .where(Task.user_id == user.user_id, Task.status == "completed", t_day >= since)
        .group_by(t_day)
    ).all()

    open_count, overdue_count = db.execute(
        select(func.count(), func.count().filter(Task.due_date < today)).where(
            Task.user_id == user.user_id, Task.status.in_(OPEN_STATUSES)
        )
    ).one()

    focus = {d: (int(minutes), done, cancelled) for d, minutes, done, cancelled in focus_rows}
    tasks_done = dict(done_rows)
    daily = []
    for i in range(days):
        d = since + timedelta(days=i)
        minutes, done, _ = focus.get(d, (0, 0, 0))
        daily.append(
            DailyStudy(day=d, focus_minutes=minutes, sessions_completed=done,
                       tasks_completed=tasks_done.get(d, 0))
        )

    return StudyStats(
        days=days,
        focus_minutes=sum(v[0] for v in focus.values()),
        sessions_completed=sum(v[1] for v in focus.values()),
        sessions_cancelled=sum(v[2] for v in focus.values()),
        tasks_completed=sum(tasks_done.values()),
        tasks_open=open_count,
        tasks_overdue=overdue_count,
        daily=daily,
    )
