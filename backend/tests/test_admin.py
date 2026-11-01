from tests.conftest import auth


def _user_id(client, headers) -> int:
    return client.get("/api/me", headers=headers).json()["user_id"]


def test_only_admins(client, register, register_staff):
    sara, counsellor = register("sara"), register_staff("counsellor", "counsellor")
    for headers in (sara, counsellor):
        assert client.get("/api/admin/users", headers=headers).status_code == 403
        assert client.get("/api/admin/overview", headers=headers).status_code == 403
    assert client.get("/api/counsellor/mood-trends", headers=sara).status_code == 403
    assert client.get("/api/counsellor/mood-trends", headers=counsellor).status_code == 200


def test_list_and_search_users(client, register, register_staff):
    admin = register_staff("admin")
    register("sara", "computing")
    register("omar", "business")
    assert len(client.get("/api/admin/users?role=student", headers=admin).json()) == 2
    found = client.get("/api/admin/users?search=OMA", headers=admin).json()
    assert [u["name"] for u in found] == ["Omar"]
    assert len(client.get("/api/admin/users?department=computing&role=student", headers=admin).json()) == 1


def test_deactivate_and_reactivate(client, register, register_staff):
    admin, sara = register_staff("admin"), register("sara")
    sara_id = _user_id(client, sara)
    client.patch(f"/api/admin/users/{sara_id}", json={"is_active": False}, headers=admin)
    assert client.get("/api/me", headers=sara).json()["detail"] == "account_deactivated"
    client.patch(f"/api/admin/users/{sara_id}", json={"is_active": True}, headers=admin)
    assert client.get("/api/me", headers=sara).status_code == 200


def test_change_role(client, register, register_staff):
    admin, sara = register_staff("admin"), register("sara")
    sara_id = _user_id(client, sara)
    r = client.patch(f"/api/admin/users/{sara_id}", json={"role": "counsellor", "department": None},
                     headers=admin)
    assert r.json()["role"] == "counsellor" and r.json()["department"] is None
    # a student must have a department
    r = client.patch(f"/api/admin/users/{sara_id}", json={"role": "student"}, headers=admin)
    assert r.status_code == 422
    r = client.patch(f"/api/admin/users/{sara_id}", json={"role": "student", "department": "business"},
                     headers=admin)
    assert r.status_code == 200


def test_admin_cannot_change_own_account(client, register_staff):
    admin = register_staff("admin")
    r = client.patch(f"/api/admin/users/{_user_id(client, admin)}", json={"is_active": False}, headers=admin)
    assert r.status_code == 400
    assert client.patch("/api/admin/users/99999", json={"is_active": False}, headers=admin).status_code == 404


def test_overview(client, register, register_staff):
    admin, sara = register_staff("admin"), register("sara")
    register("omar")
    client.post("/api/moods", json={"mood": 4}, headers=sara)
    client.post("/api/posts", json={"content": "Hi"}, headers=sara)
    o = client.get("/api/admin/overview", headers=admin).json()
    assert o["students"] == 2 and o["admins"] == 1 and o["active_students_7d"] == 1
    assert o["pending_posts"] == 1 and o["open_reports"] == 0


def test_counsellor_data_hides_small_groups(client, register, register_staff):
    counsellor = register_staff("counsellor", "counsellor")
    # 5 computing students and 4 business students check in and take a PHQ-9
    names = [(f"c{i}", "computing") for i in range(5)] + [(f"b{i}", "business") for i in range(4)]
    for name, dept in names:
        headers = register(name, dept)
        client.post("/api/moods", json={"mood": 2}, headers=headers)
        client.post("/api/assessments", json={"assessment_type": "PHQ9", "answers": [1] * 8 + [0]},
                    headers=headers)
    # private logs are never counted
    client.post("/api/moods", json={"mood": 5, "is_private": True}, headers=auth("c0"))

    trends = client.get("/api/counsellor/mood-trends", headers=counsellor).json()
    assert [(t["department"], t["students"], t["total_logs"]) for t in trends] == [("computing", 5, 5)]
    assert trends[0]["avg_mood"] == 2.0 and "user_id" not in trends[0]

    summary = client.get("/api/counsellor/assessment-summary", headers=counsellor).json()
    assert len(summary) == 1
    assert summary[0]["department"] == "computing" and summary[0]["students"] == 5
    assert summary[0]["severity"]["mild"] == 5 and summary[0]["severity"]["severe"] == 0
