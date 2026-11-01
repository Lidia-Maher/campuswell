"""Email rules for real (non dev-mode) Firebase logins, the make_admin command and
the production content seed."""

import pytest
from sqlalchemy import func, select

from app.auth import TokenClaims, get_token_claims
from app.config import get_settings
from app.database import SessionLocal
from app.main import app
from app.make_admin import set_role
from app.models import User
from app.seed import seed_content

REGISTRATION = {"name": "Lina", "department": "computing", "consent": True}


@pytest.fixture
def firebase_login(monkeypatch):
    """Pretend Firebase verified a token with these claims."""
    monkeypatch.setattr(get_settings(), "allowed_email_domains", "std.psut.edu.jo,psut.edu.jo")

    def _login(email: str, verified: bool = True) -> dict:
        claims = TokenClaims(uid=f"fb-{email}", email=email, email_verified=verified)
        app.dependency_overrides[get_token_claims] = lambda: claims
        return {"Authorization": "Bearer real-token"}

    yield _login
    app.dependency_overrides.pop(get_token_claims, None)


def test_student_email_can_register(client, firebase_login):
    headers = firebase_login("lina@std.psut.edu.jo")
    assert client.post("/api/me", json=REGISTRATION, headers=headers).status_code == 201


def test_staff_email_can_register(client, firebase_login):
    headers = firebase_login("counsellor@psut.edu.jo")
    assert client.post("/api/me", json=REGISTRATION, headers=headers).status_code == 201


def test_unverified_email_is_refused(client, firebase_login):
    headers = firebase_login("lina@std.psut.edu.jo", verified=False)
    r = client.post("/api/me", json=REGISTRATION, headers=headers)
    assert r.status_code == 403 and r.json()["detail"] == "email_not_verified"


@pytest.mark.parametrize("email", ["lina@gmail.com", "lina@fake-std.psut.edu.jo", "lina@psut.edu.jo.evil.com"])
def test_other_domains_are_refused(client, firebase_login, email):
    r = client.post("/api/me", json=REGISTRATION, headers=firebase_login(email))
    assert r.status_code == 403 and r.json()["detail"] == "email_domain_not_allowed"


def test_domain_check_is_case_insensitive(client, firebase_login):
    headers = firebase_login("Lina@STD.PSUT.EDU.JO")
    assert client.post("/api/me", json=REGISTRATION, headers=headers).status_code == 201


def test_make_admin(client, register):
    headers = register("sara")
    set_role("SARA@dev.campuswell.local", "admin")
    assert client.get("/api/me", headers=headers).json()["role"] == "admin"
    set_role("sara@dev.campuswell.local", "counsellor")
    assert client.get("/api/me", headers=headers).json()["role"] == "counsellor"
    with pytest.raises(LookupError):
        set_role("nobody@std.psut.edu.jo", "admin")


def test_content_seed_is_repeatable_and_adds_no_users():
    with SessionLocal() as db:
        first = seed_content(db)
        second = seed_content(db)
        users = db.scalar(select(func.count()).select_from(User))
    assert first["wellness_content"] > 0 and first["suggestion_templates"] > 0
    assert second == {"wellness_content": 0, "suggestion_templates": 0}
    assert users == 0
