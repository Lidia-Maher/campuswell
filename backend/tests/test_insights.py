from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text

from app.database import engine
from app.routers.insights import pearson
from app.utils import local_today

TZ = ZoneInfo("Asia/Amman")


def _add_day(email: str, days_ago: int, mood: int | None, focus_minutes: int = 0, sessions: int = 0) -> None:
    """One day of data at noon Amman time."""
    noon = datetime.combine(local_today() - timedelta(days=days_ago), time(12), TZ)
    with engine.begin() as conn:
        uid = conn.scalar(text("SELECT user_id FROM users WHERE email = :e"), {"e": email})
        if mood is not None:
            conn.execute(text("INSERT INTO mood_logs (user_id, mood, logged_at) VALUES (:u, :m, :t)"),
                         {"u": uid, "m": mood, "t": noon})
        for i in range(sessions):
            minutes = focus_minutes // sessions
            end = noon - timedelta(minutes=30 * i)
            conn.execute(text(
                "INSERT INTO pomodoro_sessions (user_id, planned_minutes, duration_minutes, status, started_at, completed_at) "
                "VALUES (:u, 25, :d, 'completed', :s, :e)"
            ), {"u": uid, "d": minutes, "s": end - timedelta(minutes=minutes), "e": end})


def test_pearson():
    assert pearson([1, 2, 3, 4], [2, 4, 6, 8]) == pytest.approx(1.0)
    assert pearson([1, 2, 3, 4], [8, 6, 4, 2]) == pytest.approx(-1.0)
    assert pearson([1, 2, 3], [5, 5, 5]) is None  # mood never changes
    assert pearson([1, 2], [1, 2]) is None  # too few points


def test_new_user_gets_no_made_up_patterns(client, register):
    data = client.get("/api/insights?days=30", headers=register("sara")).json()
    assert data["correlation"] == {"r": None, "days_used": 0, "strength": "not enough data"}
    assert data["insights"] == []
    assert len(data["daily"]) == 30 and len(data["weekdays"]) == 7


def test_study_and_mood_correlation(client, register):
    headers = register("sara")
    # more focus -> better mood, over 10 days
    for i, (mood, minutes) in enumerate([(1, 0), (2, 25), (2, 50), (3, 50), (3, 75), (4, 100), (4, 100), (5, 125), (5, 150), (5, 150)]):
        _add_day("sara@dev.campuswell.local", i, mood, minutes, sessions=max(1, minutes // 25) if minutes else 0)
    data = client.get("/api/insights?days=30", headers=headers).json()
    c = data["correlation"]
    assert c["days_used"] == 10
    assert c["strength"] == "strong"
    assert c["r"] > 0.8
    kinds = {i["kind"] for i in data["insights"]}
    assert "correlation" in kinds and "pomodoro_mood" in kinds and "consistency" in kinds
    assert data["daily"][-1]["mood"] == 1.0 and data["daily"][-1]["focus_minutes"] == 0


def test_weekday_slump(client, register):
    headers = register("sara")
    today = local_today()
    for i in range(28):
        day = today - timedelta(days=i)
        _add_day("sara@dev.campuswell.local", i, 1 if day.weekday() == 3 else 4)
    data = client.get("/api/insights?days=28", headers=headers).json()
    thursday = next(w for w in data["weekdays"] if w["weekday"] == "Thursday")
    assert thursday["avg_mood"] == 1.0 and thursday["days"] == 4
    slump = next(i for i in data["insights"] if i["kind"] == "weekday_low")
    assert slump["title"] == "Thursday slump"


def test_insights_are_private(client, register):
    sara, omar = register("sara"), register("omar")
    for i in range(8):
        _add_day("sara@dev.campuswell.local", i, 5)
    assert client.get("/api/insights", headers=omar).json()["correlation"]["days_used"] == 0
    assert client.get("/api/insights", headers=sara).json()["correlation"]["days_used"] == 8


def test_export_contains_only_my_data(client, register):
    sara, omar = register("sara"), register("omar")
    client.post("/api/moods", json={"mood": 4, "note": "Mine"}, headers=sara)
    client.post("/api/tasks", json={"title": "Lab"}, headers=sara)
    client.post("/api/assessments", json={"assessment_type": "GAD7", "answers": [1] * 7}, headers=sara)
    client.post("/api/moods", json={"mood": 2, "note": "Omar's"}, headers=omar)

    data = client.get("/api/me/export", headers=sara).json()
    assert data["profile"]["name"] == "Sara"
    assert [m["note"] for m in data["mood_logs"]] == ["Mine"]
    assert data["tasks"][0]["title"] == "Lab"
    assert data["assessments"][0]["answers"] == [1] * 7
    assert "user_id" not in data["mood_logs"][0]


def test_erase_history_keeps_account_and_posts(client, register):
    sara = register("sara")
    client.post("/api/moods", json={"mood": 4}, headers=sara)
    client.post("/api/tasks", json={"title": "Lab"}, headers=sara)
    client.post("/api/posts", json={"content": "Hello"}, headers=sara)
    client.put("/api/reminders/study", json={"remind_at": "18:00"}, headers=sara)

    assert client.delete("/api/me/data", headers=sara).status_code == 204
    assert client.get("/api/moods", headers=sara).json() == []
    assert client.get("/api/tasks", headers=sara).json() == []
    assert client.get("/api/me", headers=sara).status_code == 200
    assert len(client.get("/api/posts/mine", headers=sara).json()) == 1
    assert client.get("/api/reminders", headers=sara).json()[1]["is_enabled"] is True
