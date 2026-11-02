from datetime import date

from pydantic import BaseModel


class InsightDay(BaseModel):
    day: date
    mood: float | None  # average mood that day, None if no check-in
    focus_minutes: int
    sessions_completed: int
    tasks_completed: int


class WeekdayPattern(BaseModel):
    weekday: str  # "Monday" ...
    avg_mood: float | None
    avg_focus_minutes: float
    days: int  # days of this weekday in the period with any data


class Correlation(BaseModel):
    r: float | None  # Pearson r between daily focus minutes and daily mood; None if not enough data
    days_used: int  # days that have both a check-in and focus data
    strength: str  # "not enough data", "none", "weak", "moderate", "strong"


class Insight(BaseModel):
    kind: str  # correlation, weekday_low, weekday_high, pomodoro_mood, best_focus_day, consistency
    title: str
    message: str


class Insights(BaseModel):
    days: int
    daily: list[InsightDay]
    weekdays: list[WeekdayPattern]
    correlation: Correlation
    insights: list[Insight]
