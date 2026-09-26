"""Idempotent production seed: `python -m app.seed_production`, safe to run on every deploy (Railway's
`preDeployCommand`, or once at application startup when `SEED_ON_START=true` — see
`odd/tasks/railway-deploy.md` for why a mounted volume may need the startup path instead).

Creates up to three real accounts straight from environment variables, WITHOUT requiring `DEMO_ENABLED=true`
and WITHOUT creating any of `app.seed`'s fictional demo users (`ana@example.test`, `bea@example.test`, ...):

- `SEED_MARIA_EMAIL`/`SEED_MARIA_PASSWORD`: María's account, with her case fully prepared for everything the
  AI can generate (relato, three evidence files, an Empresa Andina profile, three historical cases so the
  reviewer's queue looks realistic, and an opening conversation) — reusing `app.seed`'s own building blocks
  verbatim, none of it duplicated here.
- `SEED_REVIEWER_EMAIL`/`SEED_REVIEWER_PASSWORD`: Lucía's reviewer membership at Empresa Andina S.A.C., so the
  organizational side of María's case can be shown too.
- `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`(/`SEED_USER_NAME`): a plain real-use account with no seeded data at
  all — a new user gets nothing beyond the account itself (no `Profile`, no `PrivateRecord`: both are created
  lazily by the app on first use, exactly like any other sign-up would get).

Any account whose email/password pair is missing from the environment is skipped entirely. An account that
already exists (looked up by email) is never touched again: its password, name and every other row this
module might otherwise have created for it are left exactly as they are."""
from uuid import NAMESPACE_URL, uuid4, uuid5
from sqlalchemy import select
from .config import settings
from .db import SessionLocal
from .models import Institution, Membership, User
from .security import passwords
from .seed import (ANDINA, attach_missing_files, ensure_conversation, ensure_history_user, ensure_profile,
                   ensure_record, seed_history)

MIN_PASSWORD_LENGTH = 16


def stable_id(value: str) -> str:
    """Deterministic id for the one production row that needs to stay the same id across deploys to remain
    idempotent (María's `PrivateRecord`, keyed off her already-stable account id). Namespaced separately from
    `app.seed.demo_id` so a production id can never collide with a fictional demo one."""
    return str(uuid5(NAMESPACE_URL, "vera-production:" + value))


def validated_password(value, label):
    if not value or len(value) < MIN_PASSWORD_LENGTH:
        raise RuntimeError(f"Configura {label} con al menos {MIN_PASSWORD_LENGTH} caracteres")
    return value


def ensure_institution(db, name):
    institution = db.scalar(select(Institution).where(Institution.name == name))
    if institution is None:
        institution = Institution(id=str(uuid4()), name=name)
        db.add(institution)
        db.flush()
    return institution


def ensure_membership(db, user_id, institution_id, role):
    if db.get(Membership, (user_id, institution_id)) is None:
        db.add(Membership(user_id=user_id, institution_id=institution_id, role=role))


def ensure_account(db, email, name, password):
    """Creates the account only if no user with this email exists yet; an existing account's id, name and
    password are never touched. Returns (user, created)."""
    email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        return user, False
    user = User(id=str(uuid4()), email=email, name=name, password_hash=passwords.hash(password), active=True)
    db.add(user)
    db.flush()
    return user, True


def seed_real_user(db, config):
    """A brand-new account with nothing beyond itself — the same starting point any new sign-up would have."""
    if not config.seed_user_email or not config.seed_user_password:
        return None
    validated_password(config.seed_user_password, "SEED_USER_PASSWORD")
    user, _ = ensure_account(db, config.seed_user_email, config.seed_user_name or "Persona usuaria",
                             config.seed_user_password)
    return user


def seed_reviewer(db, config):
    """Lucía's reviewer membership at Empresa Andina S.A.C. — the organizational side of María's case."""
    if not config.seed_reviewer_email or not config.seed_reviewer_password:
        return None
    validated_password(config.seed_reviewer_password, "SEED_REVIEWER_PASSWORD")
    institution = ensure_institution(db, ANDINA)
    user, _ = ensure_account(db, config.seed_reviewer_email, "Lucía R.", config.seed_reviewer_password)
    ensure_membership(db, user.id, institution.id, "reviewer")
    return user


def seed_maria(db, store, config, reviewer=None):
    """María's account with her case fully prepared: relato, three evidence files, an Empresa Andina profile,
    three historical cases and an opening conversation — every step here is independently idempotent (safe to
    complete a partially-seeded case on a later run), exactly like `app.seed.seed_demo_case` already is.

    `reviewer`: the real account (if any) the seeded historical cases get pre-assigned to. `seed.HISTORY`'s
    own per-case assignees are `app.seed.DEMO_USERS` emails (`andrea@example.test`, `carlos@example.test`)
    that only exist under `DEMO_ENABLED=true`; assigning to them here would violate the `assignee_id` foreign
    key. Falls back to the same inactive, non-loginable placeholder `ensure_history_user` already uses for
    the historical submitter when no reviewer was configured, so history still seeds without crashing."""
    if not config.seed_maria_email or not config.seed_maria_password:
        return None
    validated_password(config.seed_maria_password, "SEED_MARIA_PASSWORD")
    institution = ensure_institution(db, ANDINA)
    user, _ = ensure_account(db, config.seed_maria_email, "María X.", config.seed_maria_password)
    record_id = stable_id(f"maria-situacion:{user.id}")
    ensure_profile(db, user.id, institution.id)
    ensure_record(db, record_id, user.id)
    assignee_id = reviewer.id if reviewer is not None else ensure_history_user(db)
    seed_history(db, store, institution.id, assignee_id=assignee_id)
    attach_missing_files(db, store, record_id)
    ensure_conversation(db, record_id)
    return user


def run():
    """Entry point for `python -m app.seed_production` and, when `SEED_ON_START=true`, application startup."""
    from .storage import get_storage
    config = settings()
    store = get_storage()
    with SessionLocal() as db:
        seed_real_user(db, config)
        reviewer = seed_reviewer(db, config)
        seed_maria(db, store, config, reviewer=reviewer)
        db.commit()
    print("Semilla de producción aplicada (las cuentas ya existentes no se modificaron).")


if __name__ == "__main__":
    run()
