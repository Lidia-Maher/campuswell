from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.user import Department

Role = Literal["student", "admin", "counsellor"]


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    email: str
    name: str
    role: str
    department: str | None
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime


class AdminUserUpdate(BaseModel):
    """Only the fields sent are changed. Students must keep a department."""

    role: Role | None = None
    department: Department | None = None
    is_active: bool | None = None


class Overview(BaseModel):
    students: int
    admins: int
    counsellors: int
    deactivated_users: int
    active_students_7d: int  # logged a mood, Pomodoro, wellness session or assessment in 7 days
    pending_posts: int
    open_reports: int


class DepartmentMoodDay(BaseModel):
    department: str
    day: date
    students: int
    avg_mood: float
    stressed_or_anxious_logs: int
    total_logs: int


class SeveritySummary(BaseModel):
    department: str
    assessment_type: str
    students: int  # students whose latest result in the period is counted
    severity: dict[str, int]  # severity band -> number of students
