"""Tests run against a separate database whose name ends with "_test".
Example: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/campuswell_test"""

import os

import pytest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
if not TEST_DB or not TEST_DB.rstrip("/").split("?")[0].endswith("_test"):
    pytest.exit("Set TEST_DATABASE_URL to a database whose name ends with _test", returncode=1)

# must be set before the app is imported
os.environ["DATABASE_URL"] = TEST_DB
os.environ["AUTH_DEV_MODE"] = "true"
os.environ["ENVIRONMENT"] = "test"

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    cfg = Config("alembic.ini")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_tables():
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE users, wellness_content, suggestion_templates RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def client():
    return TestClient(app)


def auth(name: str) -> dict:
    """Dev-mode token for a fake user called <name>."""
    return {"Authorization": f"Bearer dev:{name}"}


@pytest.fixture
def register(client):
    def _register(name: str = "sara", department: str = "computing") -> dict:
        r = client.post(
            "/api/me",
            json={"name": name.title(), "department": department, "consent": True},
            headers=auth(name),
        )
        assert r.status_code == 201, r.text
        return auth(name)

    return _register
