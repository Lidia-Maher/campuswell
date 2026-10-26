"""All models are imported here so Alembic sees every table."""

from app.models.assessment import Assessment, AssessmentResponse
from app.models.community import Post, PostLike, PostReport
from app.models.mood import MoodLog
from app.models.reminder import Reminder
from app.models.study import PomodoroSession, Task
from app.models.suggestion import SuggestionTemplate, UserSuggestion
from app.models.user import User
from app.models.wellness import WellnessContent, WellnessSession

__all__ = [
    "Assessment",
    "AssessmentResponse",
    "MoodLog",
    "PomodoroSession",
    "Post",
    "PostLike",
    "PostReport",
    "Reminder",
    "SuggestionTemplate",
    "Task",
    "User",
    "UserSuggestion",
    "WellnessContent",
    "WellnessSession",
]
