from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Assessment, AssessmentResponse, User
from app.models.views import v_assessment_results as results
from app.schemas.assessment import AssessmentDetail, AssessmentResult, AssessmentSubmit, AssessmentType
from app.utils import get_own_or_404

router = APIRouter(prefix="/api/assessments", tags=["assessments"])

_RESULT_COLUMNS = [
    results.c.assessment_id,
    results.c.assessment_type,
    results.c.taken_at,
    results.c.total_score,
    results.c.severity,
    results.c.needs_support_message,
]


def _result(db: Session, assessment_id: int) -> AssessmentResult:
    row = db.execute(
        select(*_RESULT_COLUMNS).where(results.c.assessment_id == assessment_id)
    ).one()
    return AssessmentResult.model_validate(row._asdict())


@router.post("", response_model=AssessmentResult, status_code=status.HTTP_201_CREATED)
def submit_assessment(
    body: AssessmentSubmit, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AssessmentResult:
    """FR-12: save a complete PHQ-9 or GAD-7 and return the score.
    All answers are saved in one transaction, so a half-saved questionnaire is impossible.
    If needs_support_message is true, the app must show the support contacts right away."""
    assessment = Assessment(user_id=user.user_id, assessment_type=body.assessment_type)
    assessment.responses = [
        AssessmentResponse(assessment_type=body.assessment_type, item_number=n, score=score)
        for n, score in enumerate(body.answers, start=1)
    ]
    db.add(assessment)
    db.commit()
    return _result(db, assessment.assessment_id)


@router.get("", response_model=list[AssessmentResult])
def list_assessments(
    assessment_type: AssessmentType | None = Query(default=None, alias="type"),
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AssessmentResult]:
    """The user's results, newest first, to show progress over time."""
    query = select(*_RESULT_COLUMNS).where(results.c.user_id == user.user_id)
    if assessment_type:
        query = query.where(results.c.assessment_type == assessment_type)
    query = query.order_by(results.c.taken_at.desc()).limit(limit)
    return [AssessmentResult.model_validate(row._asdict()) for row in db.execute(query)]


@router.get("/{assessment_id}", response_model=AssessmentDetail)
def get_assessment(
    assessment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AssessmentDetail:
    assessment = get_own_or_404(db, Assessment, assessment_id, user)
    if not assessment.responses:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    result = _result(db, assessment_id)
    return AssessmentDetail(
        **result.model_dump(exclude={"recommend_counselling"}),
        answers=[r.score for r in assessment.responses],
    )
