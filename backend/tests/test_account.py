from tests.conftest import auth


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "database": "ok"}


def test_requires_token(client):
    assert client.get("/api/me").status_code == 401


def test_unregistered_user_must_register(client):
    r = client.get("/api/me", headers=auth("new"))
    assert r.status_code == 403
    assert r.json()["detail"] == "not_registered"


def test_register_requires_consent(client):
    r = client.post(
        "/api/me", json={"name": "A", "department": "computing", "consent": False}, headers=auth("a")
    )
    assert r.status_code == 422


def test_register_and_get_me(client, register):
    headers = register("sara", "engineering")
    me = client.get("/api/me", headers=headers).json()
    assert me["name"] == "Sara"
    assert me["role"] == "student"
    assert me["department"] == "engineering"


def test_register_twice_conflicts(client, register):
    headers = register("sara")
    r = client.post(
        "/api/me", json={"name": "S", "department": "computing", "consent": True}, headers=headers
    )
    assert r.status_code == 409


def test_update_profile(client, register):
    headers = register("sara")
    r = client.patch("/api/me", json={"onboarding_completed": True}, headers=headers)
    assert r.json()["onboarding_completed"] is True


def test_delete_account_removes_data(client, register):
    headers = register("sara")
    client.post("/api/moods", json={"mood": 4}, headers=headers)
    assert client.delete("/api/me", headers=headers).status_code == 204
    assert client.get("/api/me", headers=headers).json()["detail"] == "not_registered"
