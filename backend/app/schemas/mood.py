from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class MoodCreate(BaseModel):
    mood: int = Field(ge=1, le=5, description="5 happy, 4 neutral, 3 sad, 2 stressed, 1 anxious")
    note: str | None = Field(default=None, max_length=2000)
    is_private: bool = False


class MoodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: int
    mood: int
    note: str | None
    is_private: bool
    logged_at: datetime


class DailyMood(BaseModel):
    day: date
    avg_mood: float
    logs: int
    moving_avg_7d: float  # average of the daily averages over the last 7 days with data


class MoodStats(BaseModel):
    days: int
    total_logs: int
    average_mood: float | None
    streak_days: int  # consecutive days with at least one check-in, ending today or yesterday
    distribution: dict[int, int]  # mood value -> number of logs
    daily: list[DailyMood]
