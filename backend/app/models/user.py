from datetime import datetime

from sqlalchemy import CheckConstraint, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

ROLES = ("student", "admin", "counsellor")
DEPARTMENTS = ("computing", "engineering", "business")


class User(Base):
    """FR-01. Passwords are never stored: Firebase handles them, firebase_uid links the two."""

    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20), server_default="student")
    department: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    onboarding_completed: Mapped[bool] = mapped_column(server_default=text("false"))
    consent_accepted_at: Mapped[datetime]
    last_login_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('student', 'admin', 'counsellor')", name="role"),
        CheckConstraint(
            "department IN ('computing', 'engineering', 'business')", name="department"
        ),
        # every student needs a department (counsellor filters)
        CheckConstraint("role <> 'student' OR department IS NOT NULL", name="student_department"),
        Index("ix_users_role_department", "role", "department"),
    )
