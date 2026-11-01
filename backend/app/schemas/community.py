from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class PostCreate(BaseModel):
    content: str = Field(max_length=500)

    @field_validator("content")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("content must not be empty")
        return v.strip()


class PostOut(BaseModel):
    """A post in the public feed (approved posts only)."""

    post_id: int
    content: str
    author_name: str
    created_at: datetime
    like_count: int
    liked_by_me: bool
    is_mine: bool


class MyPostOut(BaseModel):
    """One of the user's own posts, with its moderation status."""

    post_id: int
    content: str
    status: str  # pending, approved, rejected
    rejection_reason: str | None
    created_at: datetime
    like_count: int


class ReportCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=255)


class ModerationPostOut(BaseModel):
    post_id: int
    content: str
    status: str
    author_id: int
    author_name: str
    created_at: datetime
    reviewed_at: datetime | None
    rejection_reason: str | None
    open_reports: int


class PostReview(BaseModel):
    decision: Literal["approve", "reject"]
    rejection_reason: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def reason_when_rejecting(self):
        if self.decision == "reject" and not (self.rejection_reason or "").strip():
            raise ValueError("a rejection_reason is required when rejecting")
        if self.decision == "approve":
            self.rejection_reason = None
        return self


class ReportOut(BaseModel):
    report_id: int
    post_id: int
    post_content: str
    post_status: str
    reporter_id: int
    reason: str
    status: str  # open, action_taken, dismissed
    created_at: datetime
    reviewed_at: datetime | None


class ReportResolve(BaseModel):
    """action_taken also rejects the post and closes every open report on it."""

    resolution: Literal["action_taken", "dismissed"]
