from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.database import engine


def test_log_and_list_mood(client, register):
    headers = register("sara")
    r = client.post("/api/moods", json={"mood": 5, "note": "Good day"}, headers=headers)
    assert r.status_code == 201
    logs = client.get("/api/moods", headers=headers).json()
    assert len(logs) == 1 and logs[0]["mood"] == 5 and logs[0]["note"] == "Good day"


def test_mood_must_be_1_to_5(client, register):
    headers = register("sara")
    assert client.post("/api/moods", json={"mood": 6}, headers=headers).status_code == 422
    assert client.post("/api/moods", json={"mood": 0}, headers=headers).status_code == 422


def test_users_only_see_their_own_moods(client, register):
    sara, omar = register("sara"), register("omar")
    log_id = client.post("/api/moods", json={"mood": 2}, headers=sara).json()["log_id"]
    assert client.get("/api/moods", headers=omar).json() == []
    assert client.delete(f"/api/moods/{log_id}", headers=omar).status_code == 404
    assert client.delete(f"/api/moods/{log_id}", headers=sara).status_code == 204


def _insert_past_mood(email: str, mood: int, days_ago: int) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO mood_logs (user_id, mood, logged_at) "
                "SELECT user_id, :mood, :at FROM users WHERE email = :email"
            ),
            {"mood": mood, "at": datetime.now(timezone.utc) - timedelta(days=days_ago), "email": email},
        )


def test_stats(client, register):
    headers = register("sara")
    email = "sara@dev.campuswell.local"
    # 3 consecutive days ending today, then a gap
    for days_ago, mood in [(0, 5), (1, 3), (2, 4), (5, 1)]:
        _insert_past_mood(email, mood, days_ago)
    _insert_past_mood(email, 3, 0)  # second check-in today

    stats = client.get("/api/moods/stats?days=30", headers=headers).json()
    assert stats["total_logs"] == 5
    assert stats["average_mood"] == 3.2
    assert stats["streak_days"] == 3
    assert stats["distribution"] == {"1": 1, "2": 0, "3": 2, "4": 1, "5": 1}
    today = stats["daily"][-1]
    assert today["logs"] == 2 and today["avg_mood"] == 4.0
    # moving average of daily averages 1, 4, 3, 4
    assert today["moving_avg_7d"] == 3.0


def test_stats_empty(client, register):
    stats = client.get("/api/moods/stats", headers=register("sara")).json()
    assert stats["total_logs"] == 0 and stats["average_mood"] is None and stats["streak_days"] == 0
