from datetime import time
from typing import Literal

from pydantic import BaseModel

ReminderType = Literal["mood_checkin", "study", "wellness"]


class ReminderSet(BaseModel):
    remind_at: time  # Amman local time, e.g. "20:00"
    is_enabled: bool = True


class ReminderOut(BaseModel):
    reminder_type: ReminderType
    remind_at: time
    is_enabled: bool
