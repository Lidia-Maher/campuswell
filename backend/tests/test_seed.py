from sqlalchemy import text

from app.database import SessionLocal, engine
from app.seed import seed
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
