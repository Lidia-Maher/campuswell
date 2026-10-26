from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# 5 = happy, 4 = neutral, 3 = sad, 2 = stressed, 1 = anxious
MOOD_LABELS = {5: "happy", 4: "neutral", 3: "sad", 2: "stressed", 1: "anxious"}


class MoodLog(Base):
    """FR-02, FR-03."""

    __tablename__ = "mood_logs"

    log_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    mood: Mapped[int] = mapped_column(SmallInteger)
    note: Mapped[str | None] = mapped_column(Text)
    is_private: Mapped[bool] = mapped_column(server_default=text("false"))
    logged_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint("mood BETWEEN 1 AND 5", name="mood_range"),
        CheckConstraint("char_length(note) <= 2000", name="note_length"),
        Index("ix_mood_logs_user_logged_at", "user_id", "logged_at"),
    )
