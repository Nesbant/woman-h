import time
import pytest
from sqlalchemy import func, select
from app.config import Settings
from app.db import SessionLocal
from app.models import Membership, Session, User
from app.security import COOKIE, token_hash
from app.seed import DEMO_USERS, demo_id, seed
from conftest import login

ANA = demo_id("ana@example.test")
AURORA = demo_id("Institución Aurora · ficticia")
BRISA = demo_id("Institución Brisa · ficticia")


@pytest.mark.parametrize("path", ["/api/auth/me", f"/api/private/{ANA}/context", f"/api/institutions/{AURORA}/context"])
def test_anonymous_denied(client, path):
    assert client.get(path).status_code == 401


def test_login_session_persisted_and_logout_revokes(client):
    response = client.post("/api/auth/login", json={"email": "ana@example.test", "password": "Vera-Ficticia-2026!"})
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/api" in cookie
    raw = client.cookies.get(COOKIE)
    with SessionLocal() as db:
        session = db.get(Session, token_hash(raw))
        assert session.user_id == ANA and session.token_hash != raw
        assert db.get(User, ANA).password_hash.startswith("$argon2id$")
    assert client.get("/api/auth/me").json()["id"] == ANA
    assert client.post("/api/auth/logout").status_code == 204
    client.cookies.set(COOKIE, raw)
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize("email", ["bea@example.test", "revisora@example.test", "admin@example.test", "otra@example.test"])
def test_no_person_or_institution_role_can_read_another_private_space(client, email):
    user = login(client, email)
    assert client.get(f"/api/private/{user['id']}/context").json()["owner_id"] == user["id"]
    response = client.get(f"/api/private/{ANA}/context")
    assert response.status_code == 403
    assert "Ana" not in response.text


@pytest.mark.parametrize("email,allowed,denied", [
    ("revisora@example.test", AURORA, BRISA),
    ("admin@example.test", AURORA, BRISA),
    ("otra@example.test", BRISA, AURORA),
])
def test_institution_isolation_no_implicit_case_access(client, email, allowed, denied):
    user = login(client, email)
    assert [m["institution_id"] for m in user["memberships"]] == [allowed]
    context = client.get(f"/api/institutions/{allowed}/context")
    assert context.status_code == 200
    assert context.json()["permissions"] == ["institution:enter"]
    assert context.json()["case_access"] is False
    assert client.get(f"/api/institutions/{denied}/context").status_code == 403


def test_person_cannot_claim_institutional_role(client):
    user = login(client)
    assert user["memberships"] == []
    assert client.get(f"/api/institutions/{AURORA}/context?role=admin", headers={"X-Role": "admin"}).status_code == 403
    assert client.post("/api/auth/login", json={"email": "ana@example.test", "password": "Vera-Ficticia-2026!", "role": "admin"}).status_code == 422


def test_membership_revocation_effective_immediately(client):
    user = login(client, "admin@example.test")
    with SessionLocal.begin() as db:
        db.delete(db.get(Membership, (user["id"], AURORA)))
    assert client.get(f"/api/institutions/{AURORA}/context").status_code == 403


@pytest.mark.parametrize("change", ["expired", "disabled", "forged"])
def test_invalid_session_denied(client, change):
    login(client)
    with SessionLocal.begin() as db:
        if change == "expired":
            db.get(Session, token_hash(client.cookies.get(COOKIE))).expires_at = int(time.time()) - 1
        elif change == "disabled":
            db.get(User, ANA).active = False
    if change == "forged":
        client.cookies.clear()
        client.cookies.set(COOKIE, "inventada")
    assert client.get("/api/auth/me").status_code == 401


def test_rotation_and_account_switch(client):
    login(client)
    old = client.cookies.get(COOKIE)
    bea = login(client, "bea@example.test")
    assert client.get("/api/auth/me").json()["id"] == bea["id"]
    with SessionLocal() as db:
        assert db.get(Session, token_hash(old)) is None
    assert client.get(f"/api/private/{ANA}/context").status_code == 403


def test_bad_credentials_have_same_response(client):
    responses = [client.post("/api/auth/login", json={"email": email, "password": "incorrecta"}) for email in ["ana@example.test", "nadie@example.test"]]
    assert all(r.status_code == 401 for r in responses)
    assert responses[0].json() == responses[1].json()


@pytest.mark.parametrize("origin,marker", [("https://otro.test", "1"), ("", "1"), ("http://localhost:5173", "")])
def test_csrf_rejected_including_login(client, origin, marker):
    headers = {"Origin": origin, "X-VERA-Request": marker}
    assert client.post("/api/auth/login", headers=headers, json={"email": "ana@example.test", "password": "Vera-Ficticia-2026!"}).status_code == 403
    login(client)
    assert client.post("/api/auth/logout", headers=headers).status_code == 403
    assert client.get("/api/auth/me").status_code == 200


def test_seed_is_idempotent_and_guarded(client, monkeypatch):
    with SessionLocal() as db:
        original = db.get(User, ANA).password_hash
    seed()
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User)) == len(DEMO_USERS)
        assert db.get(User, ANA).password_hash == original
    from app.config import settings
    monkeypatch.setattr(settings(), "demo_enabled", False)
    with pytest.raises(RuntimeError):
        seed()


def test_production_configuration_rejects_demo_and_insecure_cookies():
    with pytest.raises(ValueError):
        Settings(app_env="production", database_url="postgresql+psycopg://localhost/vera", demo_enabled=True)


def test_no_cache_of_personal_responses(client):
    login(client)
    response = client.get("/api/auth/me")
    assert response.headers["cache-control"] == "no-store"
    assert "password" not in response.text and "token" not in response.text
