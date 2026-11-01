from datetime import datetime, timedelta, timezone

BOX_BREATHING = {"category": "breathing", "title": "Box breathing", "duration_seconds": 240,
                 "inhale_seconds": 4, "hold_seconds": 4, "exhale_seconds": 4}
BODY_SCAN = {"category": "meditation", "title": "Body scan", "duration_seconds": 600,
             "media_url": "https://example.com/body-scan.mp3"}


def _started(minutes_ago: int = 5) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


def test_only_admins_manage_content(client, register, register_staff):
    student, admin = register("sara"), register_staff("admin")
    assert client.post("/api/wellness/content", json=BOX_BREATHING, headers=student).status_code == 403
    r = client.post("/api/wellness/content", json=BOX_BREATHING, headers=admin)
    assert r.status_code == 201
    content_id = r.json()["content_id"]
    assert client.patch(f"/api/wellness/content/{content_id}", json={"title": "x"},
                        headers=student).status_code == 403


def test_content_rules(client, register_staff):
    admin = register_staff("admin")
    no_pattern = {k: v for k, v in BOX_BREATHING.items() if k != "inhale_seconds"}
    assert client.post("/api/wellness/content", json=no_pattern, headers=admin).status_code == 422
    no_media = {k: v for k, v in BODY_SCAN.items() if k != "media_url"}
    assert client.post("/api/wellness/content", json=no_media, headers=admin).status_code == 422
    assert client.post("/api/wellness/content", json={**BODY_SCAN, "inhale_seconds": 4},
                       headers=admin).status_code == 422

    # an update must still satisfy the rules
    content_id = client.post("/api/wellness/content", json=BODY_SCAN, headers=admin).json()["content_id"]
    assert client.patch(f"/api/wellness/content/{content_id}", json={"media_url": None},
                        headers=admin).status_code == 422
    r = client.patch(f"/api/wellness/content/{content_id}", json={"duration_seconds": 900}, headers=admin)
    assert r.status_code == 200 and r.json()["duration_seconds"] == 900


def test_deactivated_content_is_hidden_from_students(client, register, register_staff):
    student, admin = register("sara"), register_staff("admin")
    a = client.post("/api/wellness/content", json=BOX_BREATHING, headers=admin).json()["content_id"]
    client.post("/api/wellness/content", json=BODY_SCAN, headers=admin)
    client.patch(f"/api/wellness/content/{a}", json={"is_active": False}, headers=admin)

    assert [c["title"] for c in client.get("/api/wellness/content", headers=student).json()] == ["Body scan"]
    assert client.get(f"/api/wellness/content/{a}", headers=student).status_code == 404
    assert len(client.get("/api/wellness/content?include_inactive=true", headers=admin).json()) == 2
    # students cannot see inactive content even if they ask for it
    assert len(client.get("/api/wellness/content?include_inactive=true", headers=student).json()) == 1
    meditations = client.get("/api/wellness/content?category=meditation", headers=student).json()
    assert [c["title"] for c in meditations] == ["Body scan"]


def test_sessions_and_stats(client, register, register_staff):
    sara, omar, admin = register("sara"), register("omar"), register_staff("admin")
    breathing = client.post("/api/wellness/content", json=BOX_BREATHING, headers=admin).json()["content_id"]
    scan = client.post("/api/wellness/content", json=BODY_SCAN, headers=admin).json()["content_id"]

    r = client.post("/api/wellness/sessions", json={"content_id": breathing, "duration_seconds": 240,
                                                    "started_at": _started()}, headers=sara)
    assert r.status_code == 201 and r.json()["content_title"] == "Box breathing"
    client.post("/api/wellness/sessions", json={"content_id": scan, "duration_seconds": 300,
                                                "is_completed": False, "started_at": _started(10)},
                headers=sara)

    history = client.get("/api/wellness/sessions", headers=sara).json()
    assert len(history) == 2 and client.get("/api/wellness/sessions", headers=omar).json() == []

    stats = client.get("/api/wellness/stats", headers=sara).json()
    assert stats["sessions"] == 2 and stats["minutes"] == 9.0 and stats["days_practised"] == 1
    assert {c["category"]: c["minutes"] for c in stats["by_category"]} == {"breathing": 4.0, "meditation": 5.0}


def test_session_validation(client, register, register_staff):
    sara, admin = register("sara"), register_staff("admin")
    content_id = client.post("/api/wellness/content", json=BOX_BREATHING, headers=admin).json()["content_id"]
    assert client.post("/api/wellness/sessions", json={"content_id": 9999, "duration_seconds": 60,
                                                       "started_at": _started()}, headers=sara).status_code == 404
    assert client.post("/api/wellness/sessions", json={"content_id": content_id, "duration_seconds": -1,
                                                       "started_at": _started()}, headers=sara).status_code == 422
    client.patch(f"/api/wellness/content/{content_id}", json={"is_active": False}, headers=admin)
    assert client.post("/api/wellness/sessions", json={"content_id": content_id, "duration_seconds": 60,
                                                       "started_at": _started()}, headers=sara).status_code == 404
