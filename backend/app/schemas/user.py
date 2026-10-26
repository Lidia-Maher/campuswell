from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Department = Literal["computing", "engineering", "business"]


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    department: Department
    consent: Literal[True]  # registration is refused without consent


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    department: Department | None = None
    onboarding_completed: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    email: str
    name: str
    role: str
    department: str | None
    onboarding_completed: bool
    created_at: datetime
