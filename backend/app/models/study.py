from datetime import date, datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Task(Base):
    """FR-05. 'Overdue' is not stored: it is due_date < today and status not completed/cancelled."""

    __tablename__ = "tasks"

    task_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(10), server_default="medium")
    status: Mapped[str] = mapped_column(String(20), server_default="pending")
    due_date: Mapped[date | None]
    completed_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint("priority IN ('low', 'medium', 'high')", name="priority"),
        CheckConstraint(
            "status IN ('pending', 'in-progress', 'completed', 'cancelled')", name="status"
        ),
        # completed_at is set exactly when the task is completed
        CheckConstraint(
            "(status = 'completed') = (completed_at IS NOT NULL)", name="completed_at"
        ),
        Index("ix_tasks_user_status", "user_id", "status"),
        Index("ix_tasks_user_due_date", "user_id", "due_date"),
    )


class PomodoroSession(Base):
    """FR-04. Was 'sessions' in GP1. A row is written when the session ends."""

    __tablename__ = "pomodoro_sessions"

    session_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.task_id", ondelete="SET NULL"), index=True
    )
    planned_minutes: Mapped[int] = mapped_column(SmallInteger)
    duration_minutes: Mapped[int] = mapped_column(SmallInteger)
    status: Mapped[str] = mapped_column(String(20), server_default="completed")
    started_at: Mapped[datetime]
    completed_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint("planned_minutes BETWEEN 1 AND 180", name="planned_minutes"),
        CheckConstraint("duration_minutes BETWEEN 0 AND 180", name="duration_minutes"),
        CheckConstraint("status IN ('completed', 'cancelled')", name="status"),
        CheckConstraint("completed_at >= started_at", name="times"),
        Index("ix_pomodoro_sessions_user_completed_at", "user_id", "completed_at"),
    )
