from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WellnessContent(Base):
    """FR-06, FR-07. Library of meditations, breathing exercises and sleep sounds."""

    __tablename__ = "wellness_content"

    content_id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text)
    duration_seconds: Mapped[int]
    media_url: Mapped[str | None] = mapped_column(String(500))
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    # breathing pattern (breathing exercises only)
    inhale_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    hold_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    exhale_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "category IN ('meditation', 'breathing', 'sleep_sounds')", name="category"
        ),
        CheckConstraint("duration_seconds > 0", name="duration"),
        CheckConstraint("inhale_seconds > 0", name="inhale"),
        CheckConstraint("hold_seconds >= 0", name="hold"),
        CheckConstraint("exhale_seconds > 0", name="exhale"),
        CheckConstraint(
            "(category = 'breathing' AND inhale_seconds IS NOT NULL AND exhale_seconds IS NOT NULL)"
            " OR (category <> 'breathing' AND inhale_seconds IS NULL"
            " AND hold_seconds IS NULL AND exhale_seconds IS NULL)",
            name="breathing_pattern",
        ),
        # breathing exercises are guided on screen; the others need media
        CheckConstraint("category = 'breathing' OR media_url IS NOT NULL", name="media_required"),
        Index("ix_wellness_content_active_category", "category", postgresql_where=text("is_active")),
    )


class WellnessSession(Base):
    """FR-06, FR-07. One row per meditation / breathing session a student finishes or stops."""

    __tablename__ = "wellness_sessions"

    session_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    content_id: Mapped[int] = mapped_column(
        ForeignKey("wellness_content.content_id", ondelete="RESTRICT"), index=True
    )
    duration_seconds: Mapped[int]
    is_completed: Mapped[bool] = mapped_column(server_default=text("true"))
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint("duration_seconds >= 0", name="duration"),
        CheckConstraint("ended_at >= started_at", name="times"),
        Index("ix_wellness_sessions_user_ended_at", "user_id", "ended_at"),
    )
