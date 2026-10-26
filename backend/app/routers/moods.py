from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models import MoodLog, User
from app.schemas.mood import DailyMood, MoodCreate, MoodOut, MoodStats

router = APIRouter(prefix="/api/moods", tags=["mood tracker"])


def _local_day(column):
    """Calendar day in Amman time, so a 1 AM check-in counts for the right day."""
    return cast(func.timezone(get_settings().timezone, column), Date)


@router.post("", response_model=MoodOut, status_code=status.HTTP_201_CREATED)
def log_mood(
    body: MoodCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> MoodLog:
    """FR-02: daily mood check-in."""
    log = MoodLog(user_id=user.user_id, **body.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("", response_model=list[MoodOut])
def list_moods(
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MoodLog]:
    """The user's own mood history, newest first. start/end are inclusive dates."""
    query = select(MoodLog).where(MoodLog.user_id == user.user_id)
    if start:
        query = query.where(_local_day(MoodLog.logged_at) >= start)
    if end:
        query = query.where(_local_day(MoodLog.logged_at) <= end)
    query = query.order_by(MoodLog.logged_at.desc()).limit(limit)
    return list(db.scalars(query))


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mood(
    log_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    log = db.get(MoodLog, log_id)
    # 404 (not 403) for other users' logs, so ids of other people's data are not revealed
    if log is None or log.user_id != user.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    db.delete(log)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/stats", response_model=MoodStats)
def mood_stats(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MoodStats:
    """FR-03 / FR-09: average mood, daily averages, 7-day moving average, streak, distribution."""
    today = datetime.now(ZoneInfo(get_settings().timezone)).date()
    since = today - timedelta(days=days - 1)
    day = _local_day(MoodLog.logged_at)
    mine = (MoodLog.user_id == user.user_id, day >= since)

    daily_rows = db.execute(
        select(day.label("day"), func.avg(MoodLog.mood), func.count())
        .where(*mine)
        .group_by(day)
        .order_by(day)
    ).all()
    dist_rows = db.execute(
        select(MoodLog.mood, func.count()).where(*mine).group_by(MoodLog.mood)
    ).all()
    overall = db.scalar(select(func.avg(MoodLog.mood)).where(*mine))

    daily: list[DailyMood] = []
    for i, (d, avg, count) in enumerate(daily_rows):
        window = [float(r[1]) for r in daily_rows[max(0, i - 6) : i + 1]]
        daily.append(
            DailyMood(
                day=d,
                avg_mood=round(float(avg), 2),
                logs=count,
                moving_avg_7d=round(sum(window) / len(window), 2),
            )
        )

    # streak: consecutive days with a check-in, ending today (or yesterday, if not logged yet today)
    all_days = set(
        db.scalars(
            select(day).where(MoodLog.user_id == user.user_id, day >= today - timedelta(days=365))
            .distinct()
        )
    )
    streak = 0
    cursor = today if today in all_days else today - timedelta(days=1)
    while cursor in all_days:
        streak += 1
        cursor -= timedelta(days=1)

    distribution = {m: 0 for m in range(1, 6)}
    distribution.update({mood: count for mood, count in dist_rows})

    return MoodStats(
        days=days,
        total_logs=sum(distribution.values()),
        average_mood=round(float(overall), 2) if overall is not None else None,
        streak_days=streak,
        distribution=distribution,
        daily=daily,
    )
