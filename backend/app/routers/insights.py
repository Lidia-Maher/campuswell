"""FR-09 analytics from GP1 section 4.1.4.1: the Pearson correlation between daily study time
and mood, weekday patterns (e.g. a "Thursday slump") and mood on productive days. Messages
are only produced when there is enough data, so a new user is never told a "pattern" that
is really noise."""

from datetime import timedelta
from math import sqrt

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import MoodLog, PomodoroSession, Task, User
from app.schemas.insight import Correlation, Insight, InsightDay, Insights, WeekdayPattern
from app.utils import local_day, local_today

router = APIRouter(prefix="/api/insights", tags=["analytics"])

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MIN_DAYS_FOR_CORRELATION = 7
MIN_SAMPLES_PER_WEEKDAY = 2
MIN_DAYS_PER_GROUP = 3


def pearson(xs: list[float], ys: list[float]) -> float | None:
    """Pearson correlation coefficient; None when it is undefined (fewer than 3 points or
    one of the series never changes)."""
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    if vx == 0 or vy == 0:
        return None
    return cov / sqrt(vx * vy)


def strength(r: float | None) -> str:
    if r is None:
        return "not enough data"
    a = abs(r)
    return "strong" if a >= 0.6 else "moderate" if a >= 0.3 else "weak" if a >= 0.1 else "none"


@router.get("", response_model=Insights)
def insights(
    days: int = Query(default=30, ge=7, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Insights:
    today = local_today()
    since = today - timedelta(days=days - 1)

    m_day = local_day(MoodLog.logged_at)
    moods = dict(db.execute(
        select(m_day, func.avg(MoodLog.mood))
        .where(MoodLog.user_id == user.user_id, m_day >= since).group_by(m_day)
    ).all())
    p_day = local_day(PomodoroSession.completed_at)
    focus = {d: (int(mins), done) for d, mins, done in db.execute(
        select(p_day, func.sum(PomodoroSession.duration_minutes),
               func.count().filter(PomodoroSession.status == "completed"))
        .where(PomodoroSession.user_id == user.user_id, p_day >= since).group_by(p_day)
    ).all()}
    t_day = local_day(Task.completed_at)
    tasks_done = dict(db.execute(
        select(t_day, func.count())
        .where(Task.user_id == user.user_id, Task.status == "completed", t_day >= since).group_by(t_day)
    ).all())

    daily = []
    for i in range(days):
        d = since + timedelta(days=i)
        mins, sessions = focus.get(d, (0, 0))
        mood = moods.get(d)
        daily.append(InsightDay(day=d, mood=round(float(mood), 2) if mood is not None else None,
                                focus_minutes=mins, sessions_completed=sessions,
                                tasks_completed=tasks_done.get(d, 0)))

    # correlation: days with a check-in (a day without any focus counts as 0 minutes)
    with_mood = [d for d in daily if d.mood is not None]
    r = pearson([d.focus_minutes for d in with_mood], [d.mood for d in with_mood]) \
        if len(with_mood) >= MIN_DAYS_FOR_CORRELATION else None
    correlation = Correlation(r=round(r, 2) if r is not None else None, days_used=len(with_mood), strength=strength(r))

    # weekday patterns
    weekdays = []
    for w, name in enumerate(WEEKDAYS):
        group = [d for d in daily if d.day.weekday() == w]
        mood_vals = [d.mood for d in group if d.mood is not None]
        weekdays.append(WeekdayPattern(
            weekday=name,
            avg_mood=round(sum(mood_vals) / len(mood_vals), 2) if mood_vals else None,
            avg_focus_minutes=round(sum(d.focus_minutes for d in group) / len(group), 1) if group else 0,
            days=len(mood_vals),
        ))

    return Insights(days=days, daily=daily, weekdays=weekdays, correlation=correlation,
                    insights=_messages(daily, with_mood, weekdays, correlation))


def _messages(daily, with_mood, weekdays, correlation) -> list[Insight]:
    found: list[Insight] = []
    overall = sum(d.mood for d in with_mood) / len(with_mood) if with_mood else None

    if correlation.r is not None and correlation.strength in ("moderate", "strong"):
        if correlation.r > 0:
            found.append(Insight(kind="correlation", title="Focus lifts your mood",
                                 message="Your mood tends to be higher on days you study more. Keep using focus sessions."))
        else:
            found.append(Insight(kind="correlation", title="Long study days weigh on you",
                                 message="Your mood tends to drop on days with more study time. Try shorter sessions with real breaks."))

    rated = [w for w in weekdays if w.avg_mood is not None and w.days >= MIN_SAMPLES_PER_WEEKDAY]
    if overall is not None and len(rated) >= 3:
        low = min(rated, key=lambda w: w.avg_mood)
        high = max(rated, key=lambda w: w.avg_mood)
        if overall - low.avg_mood >= 0.4:
            found.append(Insight(kind="weekday_low", title=f"{low.weekday} slump",
                                 message=f"Your mood is lowest on {low.weekday}s ({low.avg_mood:.1f} vs {overall:.1f} on average). "
                                         f"Consider planning a wellness session then."))
        if high.avg_mood - overall >= 0.4:
            found.append(Insight(kind="weekday_high", title=f"Best day: {high.weekday}",
                                 message=f"You feel best on {high.weekday}s ({high.avg_mood:.1f} on average)."))

    busy = [d.mood for d in with_mood if d.sessions_completed >= 3]
    quiet = [d.mood for d in with_mood if d.sessions_completed < 3]
    if len(busy) >= MIN_DAYS_PER_GROUP and len(quiet) >= MIN_DAYS_PER_GROUP:
        b, q = sum(busy) / len(busy), sum(quiet) / len(quiet)
        change = round((b - q) / q * 100)
        if abs(change) >= 5:
            more_less = "higher" if change > 0 else "lower"
            found.append(Insight(kind="pomodoro_mood", title="Pomodoro and mood",
                                 message=f"Your mood is {abs(change)}% {more_less} on days you complete at least 3 Pomodoro sessions."))

    focused = [w for w in weekdays if w.avg_focus_minutes > 0]
    if len(focused) >= 3:
        best = max(focused, key=lambda w: w.avg_focus_minutes)
        found.append(Insight(kind="best_focus_day", title="Deep work day",
                             message=f"You focus most on {best.weekday}s ({best.avg_focus_minutes:.0f} minutes on average). "
                                     f"Schedule your hardest subjects then."))

    logged = len(with_mood)
    if logged:
        found.append(Insight(kind="consistency", title="Check-in habit",
                             message=f"You checked in on {logged} of the last {len(daily)} days."))
    return found
