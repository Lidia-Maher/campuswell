from datetime import date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

Category = Literal["meditation", "breathing", "sleep_sounds"]


class ContentCreate(BaseModel):
    """Breathing exercises are guided on screen and need inhale/exhale seconds (hold optional).
    Meditations and sleep sounds need a media_url and no breathing pattern."""

    category: Category
    title: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=5000)
    duration_seconds: int = Field(gt=0, le=6 * 3600)
    media_url: str | None = Field(default=None, max_length=500)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    inhale_seconds: int | None = Field(default=None, gt=0, le=60)
    hold_seconds: int | None = Field(default=None, ge=0, le=60)
    exhale_seconds: int | None = Field(default=None, gt=0, le=60)
    is_active: bool = True

    @model_validator(mode="after")
    def check_category_fields(self):
        if self.category == "breathing":
            if self.inhale_seconds is None or self.exhale_seconds is None:
                raise ValueError("breathing exercises need inhale_seconds and exhale_seconds")
        else:
            if any(v is not None for v in (self.inhale_seconds, self.hold_seconds, self.exhale_seconds)):
                raise ValueError("only breathing exercises have a breathing pattern")
            if not self.media_url:
                raise ValueError(f"{self.category} needs a media_url")
        return self


class ContentUpdate(BaseModel):
    """Only the fields sent are changed. Set is_active: false to hide content (it is never deleted)."""

    category: Category | None = None
    title: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=5000)
    duration_seconds: int | None = Field(default=None, gt=0, le=6 * 3600)
    media_url: str | None = Field(default=None, max_length=500)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    inhale_seconds: int | None = Field(default=None, gt=0, le=60)
    hold_seconds: int | None = Field(default=None, ge=0, le=60)
    exhale_seconds: int | None = Field(default=None, gt=0, le=60)
    is_active: bool | None = None


class ContentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content_id: int
    category: str
    title: str
    description: str | None
    duration_seconds: int
    media_url: str | None
    thumbnail_url: str | None
    inhale_seconds: int | None
    hold_seconds: int | None
    exhale_seconds: int | None
    is_active: bool


class SessionCreate(BaseModel):
    """Sent once when a meditation / breathing session ends or is stopped."""

    content_id: int
    duration_seconds: int = Field(ge=0, le=6 * 3600, description="seconds actually listened")
    is_completed: bool = True
    started_at: AwareDatetime
    ended_at: AwareDatetime | None = Field(default=None, description="defaults to now")

    @model_validator(mode="after")
    def check_times(self):
        if self.ended_at is not None and self.ended_at < self.started_at:
            raise ValueError("ended_at must be after started_at")
        return self


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: int
    content_id: int
    content_title: str
    category: str
    duration_seconds: int
    is_completed: bool
    started_at: datetime
    ended_at: datetime


class CategoryMinutes(BaseModel):
    category: str
    sessions: int
    minutes: float


class WellnessStats(BaseModel):
    days: int
    sessions: int
    minutes: float
    days_practised: int  # days with at least one session
    by_category: list[CategoryMinutes]
    last_session_on: date | None
