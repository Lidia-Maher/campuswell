from datetime import date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, computed_field, model_validator

from app.utils import local_today

Priority = Literal["low", "medium", "high"]
TaskStatus = Literal["pending", "in-progress", "completed", "cancelled"]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    priority: Priority = "medium"
    due_date: date | None = None


class TaskUpdate(BaseModel):
    """Only the fields sent are changed. Send due_date: null to remove the due date."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    priority: Priority | None = None
    status: TaskStatus | None = None
    due_date: date | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: int
    title: str
    description: str | None
    priority: str
    status: str
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def is_overdue(self) -> bool:
        """Not stored: due before today and still open."""
        return (
            self.due_date is not None
            and self.due_date < local_today()
            and self.status in ("pending", "in-progress")
        )


class PomodoroCreate(BaseModel):
    """Sent once when a Pomodoro session ends (completed or stopped early)."""

    task_id: int | None = None
    planned_minutes: int = Field(ge=1, le=180)
    duration_minutes: int = Field(ge=0, le=180, description="minutes actually focused")
    status: Literal["completed", "cancelled"] = "completed"
    started_at: AwareDatetime
    completed_at: AwareDatetime | None = Field(default=None, description="defaults to now")

    @model_validator(mode="after")
    def check_times(self):
        if self.completed_at is not None and self.completed_at < self.started_at:
            raise ValueError("completed_at must be after started_at")
        return self


class PomodoroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: int
    task_id: int | None
    planned_minutes: int
    duration_minutes: int
    status: str
    started_at: datetime
    completed_at: datetime


class DailyStudy(BaseModel):
    day: date
    focus_minutes: int
    sessions_completed: int
    tasks_completed: int


class StudyStats(BaseModel):
    days: int
    focus_minutes: int  # completed and stopped sessions
    sessions_completed: int
    sessions_cancelled: int
    tasks_completed: int  # completed within the period
    tasks_open: int  # pending or in progress, right now
    tasks_overdue: int  # open and due before today, right now
    daily: list[DailyStudy]  # every day of the period, oldest first
