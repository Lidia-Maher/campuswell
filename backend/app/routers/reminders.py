from datetime import time
from typing import get_args

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Reminder, User
from app.schemas.reminder import ReminderOut, ReminderSet, ReminderType

router = APIRouter(prefix="/api/reminders", tags=["reminders"])

# shown (switched off) until the user saves their own setting
DEFAULT_TIMES = {"mood_checkin": time(20, 0), "study": time(9, 0), "wellness": time(21, 30)}


def _all_reminders(db: Session, user: User) -> list[ReminderOut]:
    saved = {
        r.reminder_type: r
        for r in db.scalars(select(Reminder).where(Reminder.user_id == user.user_id))
    }
    return [
        ReminderOut(reminder_type=t, remind_at=saved[t].remind_at, is_enabled=saved[t].is_enabled)
        if t in saved
        else ReminderOut(reminder_type=t, remind_at=DEFAULT_TIMES[t], is_enabled=False)
        for t in get_args(ReminderType)
    ]


@router.get("", response_model=list[ReminderOut])
def list_reminders(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ReminderOut]:
    """FR-10: the settings screen. Always returns all three reminder types."""
    return _all_reminders(db, user)


@router.put("/{reminder_type}", response_model=list[ReminderOut])
def set_reminder(
    reminder_type: ReminderType,
    body: ReminderSet,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ReminderOut]:
    """Turn a reminder on/off or change its time. Returns all three settings."""
    values = {"remind_at": body.remind_at, "is_enabled": body.is_enabled}
    db.execute(
        insert(Reminder)
        .values(user_id=user.user_id, reminder_type=reminder_type, **values)
        .on_conflict_do_update(constraint="uq_reminders_user_type", set_=values)
    )
    db.commit()
    return _all_reminders(db, user)
