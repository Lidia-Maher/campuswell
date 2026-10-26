from datetime import datetime, time

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Reminder(Base):
    """FR-10. One row per reminder type per user (settings toggles)."""

    __tablename__ = "reminders"

    reminder_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    reminder_type: Mapped[str] = mapped_column(String(20))
    remind_at: Mapped[time]
    is_enabled: Mapped[bool] = mapped_column(server_default=text("true"))
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "reminder_type IN ('mood_checkin', 'study', 'wellness')", name="type"
        ),
        UniqueConstraint("user_id", "reminder_type", name="uq_reminders_user_type"),
    )
