import os
from pathlib import Path
import tempfile
from sqlalchemy.engine import make_url

if os.environ.get("TEST_DATABASE_URL"):
    test_url = make_url(os.environ["TEST_DATABASE_URL"])
    if not test_url.database or not test_url.database.endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL debe apuntar a una base desechable cuyo nombre termine en _test")

# PostgreSQL en CI; SQLite temporal para pruebas rápidas sin servidor local.
_temporary = tempfile.TemporaryDirectory(prefix="vera-tests-")
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite:///" + str(Path(_temporary.name) / "test.db"))
os.environ["DEMO_ENABLED"] = "true"
os.environ["DEMO_PASSWORD"] = "Vera-Ficticia-2026!"
os.environ["COOKIE_SECURE"] = "false"
os.environ["ALLOWED_ORIGINS"] = '["http://localhost:5173"]'

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import delete
from app.db import SessionLocal, engine
from app.main import app
from app.models import (Membership, Session, User, Institution, PrivateRecord, Account, RecordFile, FileAccount,
                        StartEntry, Timeline, ComplaintDraft, InstitutionalCase, CaseFile)
from app.seed import seed

HEADERS = {"Origin": "http://localhost:5173", "X-VERA-Request": "1"}


@pytest.fixture(scope="session", autouse=True)
def schema():
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    command.check(config)
    yield
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    engine.dispose()


@pytest.fixture(autouse=True)
def data(schema):
    with SessionLocal.begin() as db:
        for model in (CaseFile, InstitutionalCase, ComplaintDraft, Timeline, StartEntry, FileAccount, RecordFile, Account, PrivateRecord, Session, Membership, User, Institution):
            db.execute(delete(model))
    seed()


@pytest.fixture
def client():
    with TestClient(app, headers=HEADERS) as client:
        yield client


def login(client, email="ana@example.test"):
    response = client.post("/api/auth/login", json={"email": email, "password": os.environ["DEMO_PASSWORD"]})
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def store(tmp_path, monkeypatch):
    from app.config import settings
    from app.storage import LocalStorage, get_storage
    storage = LocalStorage(settings().model_copy(update={"storage_root": tmp_path}))
    app.dependency_overrides[get_storage] = lambda: storage
    monkeypatch.setattr("app.storage.get_storage", lambda: storage)
    yield storage
    app.dependency_overrides.pop(get_storage, None)


@pytest.fixture
def demo_record(store):
    from app.seed import seed_demo_case
    return seed_demo_case()
