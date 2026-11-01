"""Small helpers shared by the routers."""

from datetime import date, datetime
from typing import TypeVar
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import Date, cast, func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import User

T = TypeVar("T")


def local_day(column):
    """Calendar day in Amman time, so a 1 AM check-in counts for the right day."""
    return cast(func.timezone(get_settings().timezone, column), Date)


def local_today() -> date:
    return datetime.now(ZoneInfo(get_settings().timezone)).date()


def get_own_or_404(db: Session, model: type[T], row_id: int, user: User) -> T:
    """The row with this id if it belongs to the user. 404 (not 403) for other users' rows,
    so ids of other people's data are not revealed."""
    row = db.get(model, row_id)
    if row is None or row.user_id != user.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return row
