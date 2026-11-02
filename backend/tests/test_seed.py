from sqlalchemy import text

from app.database import SessionLocal, engine
from app.seed import DEMO_TIME_COLUMNS, refresh_demo_dates, seed
from tests.conftest import auth


def test_seed_fills_every_table_and_view(client):
    with SessionLocal() as db:
        counts = seed(db)
    assert counts["users"] == 26 and all(n > 0 for n in counts.values())

    with engine.connect() as conn:
        # counsellor view shows departments only where at least 5 students logged
        assert conn.scalar(text("SELECT COUNT(*) FROM v_campus_daily_mood")) > 0
        assert conn.scalar(text("SELECT MIN(students) FROM v_campus_daily_mood")) >= 5
        # exactly one PHQ-9 safety flag example
        assert conn.scalar(
            text("SELECT COUNT(*) FROM v_assessment_results WHERE needs_support_message")
        ) == 1

    # seeded users work with dev-mode tokens
    stats = client.get("/api/moods/stats?days=30", headers=auth("sara")).json()
    assert stats["total_logs"] == 30 and stats["streak_days"] == 30
    assert client.get("/api/me", headers=auth("admin")).json()["role"] == "admin"


def test_refresh_dates_makes_old_demo_data_current(client):
    with SessionLocal() as db:
        seed(db)
    # a real (Firebase) user's data must never move
    with engine.begin() as conn:
        real_id = conn.scalar(text(
            "INSERT INTO users (firebase_uid, email, name, department, consent_accepted_at) "
            "VALUES ('fb-real', 'real@std.psut.edu.jo', 'Real', 'computing', now()) RETURNING user_id"
        ))
        conn.execute(text("INSERT INTO mood_logs (user_id, mood, logged_at) "
                          "VALUES (:u, 4, now() - interval '20 days')"), {"u": real_id})
        real_before = conn.scalar(text("SELECT logged_at FROM mood_logs WHERE user_id = :u"), {"u": real_id})

    # pretend the demo was seeded 10 days ago
    with engine.begin() as conn:
        for table, owner, columns in DEMO_TIME_COLUMNS:
            shifts = ", ".join(f"{c} = {c} - interval '10 days'" for c in columns)
            conn.execute(text(
                f"UPDATE {table} SET {shifts} "
                f"WHERE {owner} IN (SELECT user_id FROM users WHERE firebase_uid LIKE 'dev-%')"
            ))
    stale = client.get("/api/moods/stats?days=7", headers=auth("sara")).json()
    assert stale["total_logs"] == 0

    with SessionLocal() as db:
        assert refresh_demo_dates(db) == 10
        assert refresh_demo_dates(db) == 0  # running it again changes nothing

    fresh = client.get("/api/moods/stats?days=30", headers=auth("sara")).json()
    assert fresh["total_logs"] == 30 and fresh["streak_days"] == 30
    with engine.connect() as conn:
        # nothing ends in the future, and the real student's check-in has not moved
        assert conn.scalar(text("SELECT COUNT(*) FROM pomodoro_sessions WHERE completed_at > now()")) == 0
        assert conn.scalar(text("SELECT COUNT(*) FROM mood_logs WHERE logged_at > now()")) == 0
        assert conn.scalar(text("SELECT logged_at FROM mood_logs WHERE user_id = :u"), {"u": real_id}) == real_before
