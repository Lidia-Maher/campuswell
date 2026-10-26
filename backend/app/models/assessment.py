from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# number of questions in each questionnaire
ITEM_COUNT = {"PHQ9": 9, "GAD7": 7}


class Assessment(Base):
    """FR-12. Totals and severity are computed in the v_assessment_results view."""

    __tablename__ = "assessments"

    assessment_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    assessment_type: Mapped[str] = mapped_column(String(10))
    taken_at: Mapped[datetime] = mapped_column(server_default=func.now())

    responses: Mapped[list["AssessmentResponse"]] = relationship(
        back_populates="assessment",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AssessmentResponse.item_number",
    )

    __table_args__ = (
        CheckConstraint("assessment_type IN ('PHQ9', 'GAD7')", name="type"),
        # target for the composite foreign key in assessment_responses
        UniqueConstraint("assessment_id", "assessment_type", name="uq_assessments_id_type"),
        Index("ix_assessments_user_taken_at", "user_id", "taken_at"),
    )


class AssessmentResponse(Base):
    """One answer per row (0 = not at all ... 3 = nearly every day).
    assessment_type repeats the parent's type only so the item range can be checked;
    the composite foreign key guarantees it always matches the parent."""

    __tablename__ = "assessment_responses"

    assessment_id: Mapped[int] = mapped_column(primary_key=True)
    item_number: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    assessment_type: Mapped[str] = mapped_column(String(10))
    score: Mapped[int] = mapped_column(SmallInteger)

    assessment: Mapped[Assessment] = relationship(back_populates="responses")

    __table_args__ = (
        ForeignKeyConstraint(
            ["assessment_id", "assessment_type"],
            ["assessments.assessment_id", "assessments.assessment_type"],
            ondelete="CASCADE",
            name="fk_assessment_responses_assessment",
        ),
        CheckConstraint("score BETWEEN 0 AND 3", name="score"),
        CheckConstraint(
            "(assessment_type = 'PHQ9' AND item_number BETWEEN 1 AND 9)"
            " OR (assessment_type = 'GAD7' AND item_number BETWEEN 1 AND 7)",
            name="item_range",
        ),
    )
