"""`python -m app.seed_production`: idempotent real accounts for deploy, without DEMO_ENABLED and without any
of `app.seed`'s fictional demo users."""
import pytest
from sqlalchemy import select
from app.config import settings as real_settings
from app.db import SessionLocal
from app.models import ConversationMessage, InstitutionalCase, Membership, PrivateRecord, Profile, RecordFile, User
from app.security import passwords

MARIA_EMAIL, MARIA_PASSWORD = "maria-produccion@example.test", "Contrasena-Real-Larga-2026!"
REVIEWER_EMAIL, REVIEWER_PASSWORD = "lucia-produccion@example.test", "Otra-Contrasena-Larga-2026!"
USER_EMAIL, USER_PASSWORD = "persona-real@example.test", "Tercera-Contrasena-Larga-2026!"


def production_settings(**overrides):
    return real_settings().model_copy(update={
        "seed_maria_email": None, "seed_maria_password": None,
        "seed_reviewer_email": None, "seed_reviewer_password": None,
        "seed_user_email": None, "seed_user_password": None, "seed_user_name": None,
        **overrides})


def all_accounts_settings():
    return production_settings(
        seed_maria_email=MARIA_EMAIL, seed_maria_password=MARIA_PASSWORD,
        seed_reviewer_email=REVIEWER_EMAIL, seed_reviewer_password=REVIEWER_PASSWORD,
        seed_user_email=USER_EMAIL, seed_user_password=USER_PASSWORD, seed_user_name="Persona Real")


def run_with(monkeypatch, config):
    import app.seed_production as seed_production
    monkeypatch.setattr(seed_production, "settings", lambda: config)
    seed_production.run()


def user_by_email(email):
    with SessionLocal() as db:
        return db.scalar(select(User).where(User.email == email))


def test_missing_vars_skip_every_account(store, monkeypatch):
    run_with(monkeypatch, production_settings())
    assert user_by_email(MARIA_EMAIL) is None
    assert user_by_email(REVIEWER_EMAIL) is None
    assert user_by_email(USER_EMAIL) is None


def test_partial_vars_seed_only_the_configured_accounts(store, monkeypatch):
    run_with(monkeypatch, production_settings(seed_user_email=USER_EMAIL, seed_user_password=USER_PASSWORD))
    assert user_by_email(USER_EMAIL) is not None
    assert user_by_email(MARIA_EMAIL) is None
    assert user_by_email(REVIEWER_EMAIL) is None


def test_works_under_production_settings_without_demo_mode(store, monkeypatch):
    """Never calls app.seed.require_demo/seed_demo_case; must not require DEMO_ENABLED at all."""
    config = all_accounts_settings().model_copy(update={
        "app_env": "test",  # keep SQLite/pytest infra; demo_enabled=False is the part under test
        "demo_enabled": False})
    run_with(monkeypatch, config)
    assert user_by_email(MARIA_EMAIL) is not None
    assert user_by_email(REVIEWER_EMAIL) is not None


def test_creates_marias_full_case_and_lucias_reviewer_membership(store, monkeypatch):
    run_with(monkeypatch, all_accounts_settings())

    maria = user_by_email(MARIA_EMAIL)
    with SessionLocal() as db:
        records = db.scalars(select(PrivateRecord).where(PrivateRecord.owner_id == maria.id)).all()
        assert len(records) == 1
        record = records[0]
        files = db.scalars(select(RecordFile).where(RecordFile.record_id == record.id)).all()
        assert sorted(f.filename for f in files) == ["captura_01.png", "captura_02.png", "correo_01.pdf"]
        messages = db.scalars(select(ConversationMessage).where(ConversationMessage.record_id == record.id)).all()
        assert len(messages) == 4
        profile = db.get(Profile, maria.id)
        assert profile is not None and profile.institution_id is not None

        reviewer = user_by_email(REVIEWER_EMAIL)
        membership = db.get(Membership, (reviewer.id, profile.institution_id))
        assert membership is not None and membership.role == "reviewer"

        cases = db.scalars(select(InstitutionalCase).where(InstitutionalCase.institution_id == profile.institution_id)).all()
        assert sorted(c.case_id for c in cases) == ["V-001", "V-002", "V-003"]


def login_with(client, email, password):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def test_seeded_accounts_can_actually_log_in(client, store, monkeypatch):
    run_with(monkeypatch, all_accounts_settings())
    login_with(client, MARIA_EMAIL, MARIA_PASSWORD)
    login_with(client, REVIEWER_EMAIL, REVIEWER_PASSWORD)
    login_with(client, USER_EMAIL, USER_PASSWORD)


def test_real_use_account_has_nothing_but_the_account(store, monkeypatch):
    run_with(monkeypatch, all_accounts_settings())
    user = user_by_email(USER_EMAIL)
    with SessionLocal() as db:
        assert db.get(Profile, user.id) is None
        assert db.scalars(select(PrivateRecord).where(PrivateRecord.owner_id == user.id)).all() == []
        assert db.scalars(select(Membership).where(Membership.user_id == user.id)).all() == []
    assert user.name == "Persona Real"


def test_idempotent_second_run_never_overwrites_password_or_duplicates_accounts(store, monkeypatch):
    run_with(monkeypatch, all_accounts_settings())
    maria_id, reviewer_id, user_id = (user_by_email(e).id for e in (MARIA_EMAIL, REVIEWER_EMAIL, USER_EMAIL))

    changed = all_accounts_settings().model_copy(update={
        "seed_maria_password": "Una-Password-Distinta-000!",
        "seed_user_name": "Nombre Distinto"})
    run_with(monkeypatch, changed)

    maria = user_by_email(MARIA_EMAIL)
    assert (maria.id, user_by_email(REVIEWER_EMAIL).id, user_by_email(USER_EMAIL).id) == (maria_id, reviewer_id, user_id)
    assert passwords.verify(MARIA_PASSWORD, maria.password_hash)  # original password survives
    assert not passwords.verify("Una-Password-Distinta-000!", maria.password_hash)
    assert user_by_email(USER_EMAIL).name == "Persona Real"  # the name change was ignored too

    with SessionLocal() as db:
        records = db.scalars(select(PrivateRecord).where(PrivateRecord.owner_id == maria.id)).all()
        assert len(records) == 1  # no duplicate situation created on the second run


def test_short_password_raises_and_creates_nothing(store, monkeypatch):
    config = all_accounts_settings().model_copy(update={"seed_maria_password": "corta"})
    with pytest.raises(RuntimeError):
        run_with(monkeypatch, config)
    # Atomic: seed_real_user/seed_reviewer ran before the failing seed_maria step, but nothing was committed.
    assert user_by_email(MARIA_EMAIL) is None
    assert user_by_email(REVIEWER_EMAIL) is None
    assert user_by_email(USER_EMAIL) is None


def test_seed_on_start_runs_the_production_seed_once_at_application_startup(store, monkeypatch):
    """`main.py`'s `lifespan` — the Railway-volume workaround (`odd/tasks/railway-deploy.md`, T7): with
    `SEED_ON_START=true`, opening the app (which `TestClient(app)` does on `__enter__`, same as a real process
    start) must run `seed_production.run()` exactly like calling it directly would."""
    from app.main import app
    for attribute, value in {
        "seed_on_start": True, "seed_user_email": USER_EMAIL, "seed_user_password": USER_PASSWORD,
        "seed_user_name": "Persona Real", "seed_maria_email": None, "seed_maria_password": None,
        "seed_reviewer_email": None, "seed_reviewer_password": None,
    }.items():
        monkeypatch.setattr(real_settings(), attribute, value)

    from fastapi.testclient import TestClient
    with TestClient(app):
        pass  # startup already ran and returned by the time __enter__ completes

    assert user_by_email(USER_EMAIL) is not None
