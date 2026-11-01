from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SuggestionCategory = Literal["mood", "study", "wellness", "rest", "support"]


class SuggestionOut(BaseModel):
    suggestion_id: int
    category: str
    message: str
    reason: str | None = None  # why this tip was chosen (only for today's suggestion)
    was_helpful: bool | None
    shown_at: datetime


class SuggestionFeedback(BaseModel):
    was_helpful: bool


class TemplateCreate(BaseModel):
    category: SuggestionCategory
    message: str = Field(min_length=1, max_length=500)
    is_active: bool = True


class TemplateUpdate(BaseModel):
    category: SuggestionCategory | None = None
    message: str | None = Field(default=None, min_length=1, max_length=500)
    is_active: bool | None = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    template_id: int
    category: str
    message: str
    is_active: bool
