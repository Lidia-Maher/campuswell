from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field, model_validator

from app.models.assessment import ITEM_COUNT

AssessmentType = Literal["PHQ9", "GAD7"]

# Severity bands that get a "talk to a counsellor" recommendation (score 15 or more on
# either questionnaire). Open decision: confirm the cut-off with the supervisor.
RECOMMEND_COUNSELLING = ("moderately_severe", "severe")


class AssessmentSubmit(BaseModel):
    assessment_type: AssessmentType
    answers: list[int] = Field(
        description="one score per question in order, 0 = not at all ... 3 = nearly every day"
    )

    @model_validator(mode="after")
    def check_answers(self):
        expected = ITEM_COUNT[self.assessment_type]
        if len(self.answers) != expected:
            raise ValueError(f"{self.assessment_type} needs exactly {expected} answers")
        if any(a not in (0, 1, 2, 3) for a in self.answers):
            raise ValueError("each answer must be 0, 1, 2 or 3")
        return self


class AssessmentResult(BaseModel):
    assessment_id: int
    assessment_type: str
    taken_at: datetime
    total_score: int
    severity: str  # minimal, mild, moderate, moderately_severe (PHQ-9 only), severe
    # PHQ-9 question 9 answered above 0: show crisis / counselling contacts immediately
    needs_support_message: bool

    @computed_field
    @property
    def recommend_counselling(self) -> bool:
        """High score: suggest talking to a counsellor (less urgent than needs_support_message)."""
        return self.severity in RECOMMEND_COUNSELLING


class AssessmentDetail(AssessmentResult):
    answers: list[int]
