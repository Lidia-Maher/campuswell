from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SuggestionTemplate(Base):
    """FR-11 (optional). Predefined, non-clinical wellness tips."""

    __tablename__ = "suggestion_templates"

    template_id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "category IN ('mood', 'study', 'wellness', 'rest', 'support')", name="category"
        ),
    )


class UserSuggestion(Base):
    """FR-11 (optional). Which tip was shown to which user, and their feedback."""

    __tablename__ = "user_suggestions"

    suggestion_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    template_id: Mapped[int] = mapped_column(
        ForeignKey("suggestion_templates.template_id", ondelete="RESTRICT"), index=True
    )
    model_version: Mapped[str | None] = mapped_column(String(50))
    was_helpful: Mapped[bool | None]
    shown_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (Index("ix_user_suggestions_user_shown_at", "user_id", "shown_at"),)
