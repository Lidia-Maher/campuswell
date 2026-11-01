from datetime import date, datetime, timedelta, timezone


def _now() -> datetime:
    return datetime.now(timezone.utc)


def test_create_and_list_tasks(client, register):
    headers = register("sara")
    client.post("/api/tasks", json={"title": "Later", "priority": "low"}, headers=headers)
    client.post("/api/tasks", json={"title": "Soon", "due_date": str(date.today())}, headers=headers)
    tasks = client.get("/api/tasks", headers=headers).json()
    assert [t["title"] for t in tasks] == ["Soon", "Later"]  # due date first, none last
    assert tasks[0]["status"] == "pending" and tasks[0]["priority"] == "medium"


def test_complete_and_reopen_task(client, register):
    headers = register("sara")
    task_id = client.post("/api/tasks", json={"title": "Lab"}, headers=headers).json()["task_id"]

    done = client.patch(f"/api/tasks/{task_id}", json={"status": "completed"}, headers=headers).json()
    assert done["status"] == "completed" and done["completed_at"] is not None

    reopened = client.patch(f"/api/tasks/{task_id}", json={"status": "pending"}, headers=headers).json()
    assert reopened["completed_at"] is None


def test_overdue_is_computed(client, register):
    headers = register("sara")
    yesterday = str(date.today() - timedelta(days=2))
    late = client.post("/api/tasks", json={"title": "Late", "due_date": yesterday}, headers=headers)
    assert late.json()["is_overdue"] is True
    client.post("/api/tasks", json={"title": "No date"}, headers=headers)

    overdue = client.get("/api/tasks?overdue=true", headers=headers).json()
    assert [t["title"] for t in overdue] == ["Late"]

    task_id = late.json()["task_id"]
    done = client.patch(f"/api/tasks/{task_id}", json={"status": "completed"}, headers=headers)
    assert done.json()["is_overdue"] is False


def test_task_validation(client, register):
    headers = register("sara")
    assert client.post("/api/tasks", json={"title": ""}, headers=headers).status_code == 422
    assert client.post("/api/tasks", json={"title": "x", "priority": "urgent"}, headers=headers).status_code == 422
    task_id = client.post("/api/tasks", json={"title": "x"}, headers=headers).json()["task_id"]
    assert client.patch(f"/api/tasks/{task_id}", json={"title": None}, headers=headers).status_code == 422


def test_users_only_see_their_own_tasks(client, register):
    sara, omar = register("sara"), register("omar")
    task_id = client.post("/api/tasks", json={"title": "Mine"}, headers=sara).json()["task_id"]
    assert client.get("/api/tasks", headers=omar).json() == []
    assert client.get(f"/api/tasks/{task_id}", headers=omar).status_code == 404
    assert client.patch(f"/api/tasks/{task_id}", json={"status": "completed"}, headers=omar).status_code == 404
    assert client.delete(f"/api/tasks/{task_id}", headers=omar).status_code == 404
    # cannot link a Pomodoro session to someone else's task
    r = client.post("/api/pomodoro", json={"task_id": task_id, "planned_minutes": 25,
                                           "duration_minutes": 25,
                                           "started_at": (_now() - timedelta(minutes=25)).isoformat()},
                    headers=omar)
    assert r.status_code == 404
    assert client.delete(f"/api/tasks/{task_id}", headers=sara).status_code == 204


def test_pomodoro_session(client, register):
    headers = register("sara")
    task_id = client.post("/api/tasks", json={"title": "Read"}, headers=headers).json()["task_id"]
    r = client.post("/api/pomodoro", json={
        "task_id": task_id, "planned_minutes": 25, "duration_minutes": 25,
        "started_at": (_now() - timedelta(minutes=25)).isoformat(),
    }, headers=headers)
    assert r.status_code == 201 and r.json()["status"] == "completed"

    sessions = client.get(f"/api/pomodoro?task_id={task_id}", headers=headers).json()
    assert len(sessions) == 1

    # deleting the task keeps the session
    client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert client.get("/api/pomodoro", headers=headers).json()[0]["task_id"] is None


def test_pomodoro_validation(client, register):
    headers = register("sara")
    start = _now().isoformat()
    body = {"planned_minutes": 25, "duration_minutes": 10, "started_at": start}
    assert client.post("/api/pomodoro", json={**body, "planned_minutes": 0}, headers=headers).status_code == 422
    assert client.post("/api/pomodoro", json={**body, "status": "paused"}, headers=headers).status_code == 422
    # times must include a time zone, and end after the start
    assert client.post("/api/pomodoro", json={**body, "started_at": "2026-10-01T10:00:00"},
                       headers=headers).status_code == 422
    early = (_now() - timedelta(hours=1)).isoformat()
    assert client.post("/api/pomodoro", json={**body, "completed_at": early}, headers=headers).status_code == 422


def test_study_stats(client, register):
    headers = register("sara")
    start = (_now() - timedelta(minutes=30)).isoformat()
    client.post("/api/pomodoro", json={"planned_minutes": 25, "duration_minutes": 25, "started_at": start},
                headers=headers)
    client.post("/api/pomodoro", json={"planned_minutes": 25, "duration_minutes": 10,
                                       "status": "cancelled", "started_at": start}, headers=headers)
    a = client.post("/api/tasks", json={"title": "A"}, headers=headers).json()["task_id"]
    client.post("/api/tasks", json={"title": "B", "due_date": str(date.today() - timedelta(days=3))},
                headers=headers)
    client.patch(f"/api/tasks/{a}", json={"status": "completed"}, headers=headers)

    stats = client.get("/api/study/stats?days=7", headers=headers).json()
    assert stats["focus_minutes"] == 35
    assert stats["sessions_completed"] == 1 and stats["sessions_cancelled"] == 1
    assert stats["tasks_completed"] == 1 and stats["tasks_open"] == 1 and stats["tasks_overdue"] == 1
    assert len(stats["daily"]) == 7
    assert stats["daily"][-1]["focus_minutes"] == 35 and stats["daily"][-1]["tasks_completed"] == 1
    assert stats["daily"][0]["focus_minutes"] == 0
