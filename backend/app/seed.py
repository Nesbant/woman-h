"""Carga explícita e idempotente; nunca cambia contraseñas de cuentas existentes."""
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid5
from sqlalchemy import select
from .config import settings
from .db import SessionLocal
from .models import Account, Institution, Membership, PrivateRecord, RecordFile, User
from .security import passwords

DEMO_USERS = [
    ("ana@example.test", "Ana Demo", None, None),
    ("bea@example.test", "Bea Demo", None, None),
    ("revisora@example.test", "Lucía Demo", "reviewer", "Institución Aurora · ficticia"),
    ("admin@example.test", "María Demo", "admin", "Institución Aurora · ficticia"),
    ("otra@example.test", "Elena Demo", "reviewer", "Institución Brisa · ficticia"),
]


def demo_id(value):
    return str(uuid5(NAMESPACE_URL, "vera-demo:" + value))


def seed():
    config = settings()
    if config.app_env == "production" or not config.demo_enabled:
        raise RuntimeError("La carga ficticia requiere DEMO_ENABLED=true en desarrollo o pruebas")
    if not config.demo_password or len(config.demo_password) < 16:
        raise RuntimeError("Configura DEMO_PASSWORD con al menos 16 caracteres")
    with SessionLocal.begin() as db:
        for email, name, role, institution_name in DEMO_USERS:
            user = db.scalar(select(User).where(User.email == email))
            if user is not None:
                if user.id != demo_id(email):
                    raise RuntimeError("El correo ficticio ya pertenece a otra cuenta")
                continue
            user = User(id=demo_id(email), email=email, name=name,
                        password_hash=passwords.hash(config.demo_password), active=True)
            db.add(user)
            db.flush()
            if role:
                institution_id = demo_id(institution_name)
                if db.get(Institution, institution_id) is None:
                    db.add(Institution(id=institution_id, name=institution_name))
                    db.flush()
                db.add(Membership(user_id=user.id, institution_id=institution_id, role=role))
    print("Usuarios ficticios preparados. No se modificaron cuentas existentes.")


def seed_demo_case():
    """SPEC Issue 8: one private record with a relato, two screenshots and an email PDF. Synthetic only."""
    from .accounts import AccountInput, add_account
    from .demo_assets import CAPTURA_01, CAPTURA_02, CORREO_LINES, RELATO, chat_png, room_png, text_pdf
    from . import files
    from .files import FileMetadata
    from .storage import get_storage
    config = settings()
    if config.app_env == "production" or not config.demo_enabled:
        raise RuntimeError("La carga ficticia requiere DEMO_ENABLED=true en desarrollo o pruebas")
    record_id = demo_id("record:situacion-001")
    assets = [("captura_01.png", chat_png, CAPTURA_01, True),
              ("correo_01.pdf", lambda: text_pdf(CORREO_LINES), None, False),
              ("captura_02.png", room_png, CAPTURA_02, False)]
    with SessionLocal() as db:
        if db.get(PrivateRecord, record_id) is None:
            now = datetime.now(timezone.utc)
            db.add(PrivateRecord(id=record_id, owner_id=demo_id("ana@example.test"), title="Situación #001",
                                 description=RELATO, status="private_draft", created_at=now, updated_at=now))
            db.flush()
            add_account(db, UUID(record_id), AccountInput(
                description=RELATO, date_kind="approximate", approximate_date="mediados de septiembre de 2026",
                place="Sala 3", mentioned_people="Julio Ramírez (supervisor)"))
            db.commit()
        account = db.scalar(select(Account).where(Account.record_id == record_id).order_by(Account.created_at, Account.id))
        present = set(db.scalars(select(RecordFile.filename).where(RecordFile.record_id == record_id)))
        missing = [asset for asset in assets if asset[0] not in present]
        if not missing:
            print("La situación ficticia ya existe. No se modificó.")
            return record_id
        # Re-running completes a case left half-created by an earlier failure; existing files are never touched.
        store = get_storage()
        for filename, build, description, linked in missing:
            files.persist_file(db, store, record_id, filename, build(),
                               FileMetadata(description=description, account_ids=[account.id] if linked else []))
    print("Situación ficticia preparada para Ana Demo.")
    return record_id


if __name__ == "__main__":
    seed()
    seed_demo_case()
