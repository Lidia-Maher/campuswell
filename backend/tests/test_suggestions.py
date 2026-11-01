from datetime import date, timedelta

import pytest

from app.database import SessionLocal
from app.models import SuggestionTemplate

TIPS = [
    ("mood", "A short walk outside can help."),
    ("study", "Break big assignments into small tasks."),
    ("study", "Try studying hard topics before noon."),
    ("wellness", "Try a 5-minute breathing exercise."),
    ("rest", "Remember to take a proper break."),
    ("support", "The counselling office is here to help."),
]


@pytest.fixture
def tips():
    with SessionLocal() as db:
        db.add_all(SuggestionTemplate(category=c, message=m) for c, m in TIPS)
        db.commit()


def test_one_tip_per_day(client, register, tips):
    headers = register("sara")
    first = client.get("/api/suggestions/today", headers=headers).json()
    # no wellness session this week -> wellness tip
    assert first["category"] == "wellness" and first["reason"]
    again = client.get("/api/suggestions/today", headers=headers).json()
    assert again["suggestion_id"] == first["suggestion_id"]
    assert len(client.get("/api/suggestions", headers=headers).json()) == 1


def test_low_mood_gets_mood_tip(client, register, tips):
    headers = register("sara")
    client.post("/api/moods", json={"mood": 1}, headers=headers)
    client.post("/api/moods", json={"mood": 2}, headers=headers)
    assert client.get("/api/suggestions/today", headers=headers).json()["category"] == "mood"


def test_overdue_tasks_get_study_tip(client, register, tips):
    headers = register("sara")
    client.post("/api/moods", json={"mood": 5}, headers=headers)
    late = str(date.today() - timedelta(days=3))
    for title in ("A", "B"):
        client.post("/api/tasks", json={"title": title, "due_date": late}, headers=headers)
    tip = client.get("/api/suggestions/today", headers=headers).json()
    assert tip["category"] == "study" and "2 overdue" in tip["reason"]


def test_support_need_replaces_todays_tip(client, register, tips):
    headers = register("sara")
    assert client.get("/api/suggestions/today", headers=headers).json()["category"] == "wellness"
    client.post("/api/assessments", json={"assessment_type": "PHQ9", "answers": [0] * 8 + [1]},
                headers=headers)
    tip = client.get("/api/suggestions/today", headers=headers).json()
    assert tip["category"] == "support"


def test_feedback(client, register, tips):
    sara, omar = register("sara"), register("omar")
    tip_id = client.get("/api/suggestions/today", headers=sara).json()["suggestion_id"]
    r = client.post(f"/api/suggestions/{tip_id}/feedback", json={"was_helpful": True}, headers=sara)
    assert r.json()["was_helpful"] is True
    assert client.post(f"/api/suggestions/{tip_id}/feedback", json={"was_helpful": False},
                       headers=omar).status_code == 404


def test_no_tips_available(client, register):
    assert client.get("/api/suggestions/today", headers=register("sara")).status_code == 404


def test_admin_manages_tips(client, register, register_staff):
    admin, sara = register_staff("admin"), register("sara")
    assert client.post("/api/admin/suggestion-templates", json={"category": "rest", "message": "Sleep"},
                       headers=sara).status_code == 403
    r = client.post("/api/admin/suggestion-templates", json={"category": "rest", "message": "Sleep well"},
                    headers=admin)
    assert r.status_code == 201
    template_id = r.json()["template_id"]
    # the only tip is "rest", so it is used whatever the category
    assert client.get("/api/suggestions/today", headers=sara).json()["message"] == "Sleep well"
    client.patch(f"/api/admin/suggestion-templates/{template_id}", json={"is_active": False}, headers=admin)
    assert client.get("/api/admin/suggestion-templates", headers=admin).json()[0]["is_active"] is False
