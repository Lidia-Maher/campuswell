from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Post(Base):
    """FR-08. New posts are 'pending' until an admin approves or rejects them."""

    __tablename__ = "posts"

    post_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), server_default="pending")
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"), index=True
    )
    reviewed_at: Mapped[datetime | None]
    rejection_reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint("char_length(trim(content)) > 0", name="content_not_empty"),
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="status"),
        CheckConstraint(
            "(status = 'pending' AND reviewed_at IS NULL)"
            " OR (status <> 'pending' AND reviewed_at IS NOT NULL)",
            name="review",
        ),
        Index("ix_posts_status_created_at", "status", text("created_at DESC")),
    )


class PostLike(Base):
    """FR-08. One like per user per post."""

    __tablename__ = "post_likes"

    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.post_id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class PostReport(Base):
    """FR-08. A user can report a post once."""

    __tablename__ = "post_reports"

    report_id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.post_id", ondelete="CASCADE"))
    reporter_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    reason: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), server_default="open")
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"), index=True
    )
    reviewed_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('open', 'action_taken', 'dismissed')", name="status"),
        UniqueConstraint("post_id", "reporter_id", name="uq_post_reports_post_reporter"),
        Index("ix_post_reports_open", "created_at", postgresql_where=text("status = 'open'")),
    )
