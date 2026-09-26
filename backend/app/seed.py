"""Carga explícita e idempotente; nunca cambia contraseñas de cuentas existentes."""
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid5
from sqlalchemy import select
from .config import settings
from .db import SessionLocal
from .models import Account, CaseFile, Institution, InstitutionalCase, Membership, PrivateRecord, Profile, RecordFile, User
from .security import passwords

DEMO_USERS = [
    ("ana@example.test", "Ana Demo", None, None),
    ("bea@example.test", "Bea Demo", None, None),
    ("revisora@example.test", "Lucía Demo", "reviewer", "Institución Aurora · ficticia"),
    ("admin@example.test", "María Demo", "admin", "Institución Aurora · ficticia"),
    ("otra@example.test", "Elena Demo", "reviewer", "Institución Brisa · ficticia"),
    # Narrativa del prototipo (SPEC §55): persona, responsables de RR. HH. y organización ficticia.
    ("maria@example.test", "María X.", None, None),
    ("lucia@example.test", "Lucía R.", "reviewer", "Empresa Andina S.A.C."),
    ("andrea@example.test", "Andrea R.", "reviewer", "Empresa Andina S.A.C."),
    ("carlos@example.test", "Carlos M.", "admin", "Empresa Andina S.A.C."),
]
ANDINA = "Empresa Andina S.A.C."


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
    """SPEC Issue 8, prototype narrative: María's private situation plus three earlier cases received by
    Empresa Andina S.A.C., so the new submission becomes V-004. Synthetic only; idempotent and self-repairing."""
    from .accounts import AccountInput, add_account
    from . import files
    from .demo_assets import CAPTURA_01, CAPTURA_02, CORREO_LINES, NOTA, RELATO, chat_png, room_png, text_pdf
    from .files import FileMetadata
    from .storage import get_storage
    config = settings()
    if config.app_env == "production" or not config.demo_enabled:
        raise RuntimeError("La carga ficticia requiere DEMO_ENABLED=true en desarrollo o pruebas")
    maria, andina = demo_id("maria@example.test"), demo_id(ANDINA)
    record_id = demo_id("record:maria-situacion-001")
    assets = [("captura_01.png", chat_png, CAPTURA_01, True),
              ("correo_01.pdf", lambda: text_pdf(CORREO_LINES), None, True),
              ("captura_02.png", room_png, CAPTURA_02, False)]
    store = get_storage()
    with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        if db.get(Profile, maria) is None:
            db.add(Profile(user_id=maria, institution_id=andina, document="DNI •••• 4821", contact="maria.x@correo.pe",
                           position="Analista", area="Operaciones", relationship="Trabajadora en planilla", updated_at=now))
        if db.get(PrivateRecord, record_id) is None:
            db.add(PrivateRecord(id=record_id, owner_id=maria, title="Situación #001", description=RELATO,
                                 private_note=NOTA, status="private_draft", created_at=now, updated_at=now))
            db.flush()
            add_account(db, UUID(record_id), AccountInput(
                description=RELATO, date_kind="approximate", approximate_date="mediados de septiembre",
                mentioned_people="Juan X. · Supervisor"))
        db.commit()
        seed_history(db, store, andina)
        account = db.scalar(select(Account).where(Account.record_id == record_id).order_by(Account.created_at, Account.id))
        present = set(db.scalars(select(RecordFile.filename).where(RecordFile.record_id == record_id)))
        missing = [asset for asset in assets if asset[0] not in present]
        if not missing:
            print("La situación ficticia ya existe. No se modificó.")
            return record_id
        # Re-running completes a case left half-created by an earlier failure; existing files are never touched.
        for filename, build, description, linked in missing:
            files.persist_file(db, store, record_id, filename, build(),
                               FileMetadata(description=description, account_ids=[account.id] if linked else []))
    print("Situación ficticia preparada para María X.")
    return record_id


HISTORY = [
    ("V-001", "2026-09-22T10:05:00+00:00", "in_review", "andrea@example.test",
     ("Rosa P.", "Asistente", "Ventas"), ("Luis T.", "Coordinador"),
     [("2026-09-08", None, "Comentarios en reunión de equipo"), ("2026-09-12", None, "Mensajes por chat interno"),
      (None, "mediados de septiembre", "Reunión uno a uno")],
     [("chat_interno.pdf", "application/pdf"), ("captura_equipo.png", "image/png")],
     [("reporting_line", "Cambio de línea de reporte")],
     ["done", "done", "in_progress", "pending", "pending", "pending", "pending"]),
    ("V-002", "2026-09-18T15:30:00+00:00", "follow_up", "carlos@example.test",
     ("Ana G.", "Operaria", "Almacén"), ("Pedro S.", "Jefe de turno"),
     [("2026-09-02", None, "Comentario en almacén"), ("2026-09-09", None, "Mensaje de voz")],
     [("mensaje_voz.m4a", "audio/mp4")],
     [("no_contact", "Impedimento de acercamiento o contacto")],
     ["done", "done", "done", "done", "in_progress", "pending", "in_progress"]),
    ("V-003", "2026-09-04T09:00:00+00:00", "closed", "andrea@example.test",
     ("Carla V.", "Analista", "Finanzas"), ("Jorge L.", "Analista"),
     [("2026-08-14", None, "Correo fuera de horario")],
     [("correo_ago.pdf", "application/pdf")], [], ["done"] * 7),
]


def seed_history(db, store, institution_id):
    """Earlier synthetic cases, so Institutional shows a realistic queue. Only created when absent."""
    import hashlib
    from uuid import uuid4
    from .demo_assets import placeholder_file
    from .procedure import STEPS
    history_user = demo_id("historial@example.test")
    if db.get(User, history_user) is None:
        # Inactive placeholder submitter: it cannot sign in and owns no private data.
        db.add(User(id=history_user, email="historial@example.test", name="Casos anteriores (sintéticos)",
                    password_hash=passwords.hash(uuid4().hex + uuid4().hex), active=False))
        db.flush()
    for case_id, received, status, assignee, affected, respondent, events, attachments, measures, steps in HISTORY:
        if db.scalar(select(InstitutionalCase).where(InstitutionalCase.institution_id == institution_id,
                                                     InstitutionalCase.case_id == case_id)):
            continue
        at = datetime.fromisoformat(received)
        case = InstitutionalCase(id=str(uuid4()), case_id=case_id, institution_id=institution_id, submitted_by=history_user,
                                 submitted_at=at, status=status, assignee_id=demo_id(assignee), created_at=at, snapshot_json={},
                                 procedure_json={key: {"status": state, "updated_at": received, "updated_by": demo_id(assignee)}
                                                 for (key, _, _, _), state in zip(STEPS, steps)})
        for filename, media_type in attachments:
            data = placeholder_file(filename)
            key = f"cases/{uuid4().hex}"
            store.put(key, data)
            case.files.append(CaseFile(id=str(uuid4()), source_file_id=str(uuid4()), filename=filename, media_type=media_type,
                                       sha256=hashlib.sha256(data).hexdigest(), storage_key=key, created_at=at))
        field = lambda value: {"value": value, "origin": "person" if value else None}
        case.snapshot_json = {
            "schema": "vera.case.v2", "case_id": case_id, "submitted_at": received, "institution_id": institution_id,
            "summary": f"Caso recibido con {len(events)} {'evento' if len(events) == 1 else 'eventos'} y "
                       f"{len(attachments)} {'archivo' if len(attachments) == 1 else 'archivos'} seleccionados por la persona.",
            "affected": {"name": field(affected[0]), "position": field(affected[1]), "area": field(affected[2])},
            "respondent": {"name": field(respondent[0]), "position": field(respondent[1])}, "respondent_confirmed": True,
            "reporter": {"same_as_affected": True, "name": field(affected[0])},
            "facts": {"events": [{"title": title, "description": "", "date_kind": "exact" if day else "approximate",
                                  "event_date": day, "approximate_date": approx, "event_time": None, "sources": []}
                                 for day, approx, title in events], "consequences": field(None)},
            "evidence": [{"file_id": item.id, "filename": item.filename, "media_type": item.media_type, "sha256": item.sha256}
                         for item in case.files],
            "protection_measures": {"selected": [{"code": code, "label": label} for code, label in measures], "other": None},
        }
        db.add(case)
    db.commit()


if __name__ == "__main__":
    seed()
    seed_demo_case()
