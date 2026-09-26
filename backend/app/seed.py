"""Carga explícita e idempotente; nunca cambia contraseñas de cuentas existentes."""
from datetime import datetime, timezone
from typing import NamedTuple
from uuid import NAMESPACE_URL, UUID, uuid5
from sqlalchemy import select
from .config import settings
from .db import SessionLocal
from .models import (Account, CaseFile, ConversationMessage, Institution, InstitutionalCase, Membership,
                    PrivateRecord, Profile, RecordFile, Timeline, User)
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


def require_demo():
    config = settings()
    if config.app_env == "production" or not config.demo_enabled:
        raise RuntimeError("La carga ficticia requiere DEMO_ENABLED=true en desarrollo o pruebas")


MARIA_RECORD = "record:maria-situacion-001"
MARIA_CONVERSATION_RECORD = "record:maria-conversacion-001"


def ensure_profile(db, user_id, institution_id):
    if db.get(Profile, user_id) is None:
        db.add(Profile(user_id=user_id, institution_id=institution_id, document="DNI •••• 4821", contact="maria.x@correo.pe",
                       position="Analista", area="Operaciones", relationship="Trabajadora en planilla",
                       updated_at=datetime.now(timezone.utc)))


def ensure_record(db, record_id, owner_id):
    from .accounts import AccountInput, add_account
    from .demo_assets import NOTA, RELATO
    if db.get(PrivateRecord, record_id) is not None:
        return
    now = datetime.now(timezone.utc)
    db.add(PrivateRecord(id=record_id, owner_id=owner_id, title="Situación #001", description=RELATO,
                         private_note=NOTA, status="private_draft", created_at=now, updated_at=now))
    db.flush()
    add_account(db, UUID(record_id), AccountInput(description=RELATO, date_kind="approximate",
                                                  approximate_date="mediados de septiembre", mentioned_people="Juan X. · Supervisor"))


# EST-07 (issue #13): María's opening conversation, in her own words — the same two sentences the seeded
# relato (`demo_assets.RELATO`) already tells, split into the narrate/confirm/narrate turns a real chat with
# her would plausibly have had: she tells the first fact, asks VERA to keep it, then adds a second one that
# is left as a candidate, exactly as a person exploring the conversation for the first time would leave it —
# not everything gets confirmed right away. Reusing the relato's own wording (rather than inventing new
# facts) is what makes this conversation "consistent with her evidence" instead of a parallel, unrelated one.
CONVERSATION_TURNS = [
    "A mediados de septiembre tuve una reunión con mi supervisor. Me hizo un comentario que me incomodó.",
    "Guárdalo, quiero dejar constancia de eso.",
    "El martes 15 por la noche recibí mensajes suyos fuera del horario laboral y luego un correo sobre mi evaluación.",
]


def ensure_conversation_record(db, owner_id):
    """A second, separate private situation for María (`MARIA_CONVERSATION_RECORD`), the one the seeded chat
    conversation lives in — deliberately apart from `MARIA_RECORD`, the account/file-driven prototype
    narrative `test_demo_fixture_produces_sourced_events_and_review_items` and the complaint-generation tests
    are built on. Both a case's conversation-sourced events and its extractive/AI analysis share one
    `Timeline` row, and `timeline.merge_proposals` keeps conversation-origin candidates across reprocessing
    (EST-02's MUST FIX, epic #5/issue #8) — so seeding a conversation directly onto `MARIA_RECORD` would
    silently add message-sourced events to, and bump the revision of, the exact frozen fixture case those
    tests assert on. A second case avoids that collision while still showing a real, persisted conversation
    for the same demo person."""
    record_id = demo_id(MARIA_CONVERSATION_RECORD)
    if db.get(PrivateRecord, record_id) is not None:
        return record_id
    now = datetime.now(timezone.utc)
    db.add(PrivateRecord(id=record_id, owner_id=owner_id, title="Conversación #001",
                         description="Conversación iniciada desde el chat.", private_note=None,
                         status="private_draft", created_at=now, updated_at=now))
    db.flush()
    return record_id


def ensure_conversation(db, record_id):
    """Runs María's opening conversation through the real turn orchestrator (`agent/turn.py::run_turn`) with
    a forced `ScriptedBrain` — never the configured `CHAT_BRAIN` — so `conversation_messages`,
    `Timeline.events` and the derived `case_state` are exactly what the real chat endpoint would have
    produced, never a hand-built fixture that could drift from it. Idempotent and self-repairing like the
    rest of this module: skipped entirely once this case already has any conversation history, and each
    turn's `client_message_id` is derived deterministically from the case and turn index, so re-running
    after a partial failure resumes instead of duplicating."""
    from .agent.contracts import ChatTurnRequest
    from .agent.scripted import ScriptedBrain
    from .agent.turn import run_turn
    if db.scalar(select(ConversationMessage).where(ConversationMessage.record_id == record_id)) is not None:
        return False
    if db.get(Timeline, record_id) is None:
        now = datetime.now(timezone.utc)
        db.add(Timeline(record_id=record_id, revision=0, confirmed_revision=None, mode="empty",
                        events=[], warnings=[], review_items=[], processed_at=now))
        db.flush()
    brain = ScriptedBrain()
    for index, text in enumerate(CONVERSATION_TURNS):
        request = ChatTurnRequest(text=text, client_message_id=demo_id(f"conversation:{record_id}:{index}"),
                                  attachment_ids=[])
        run_turn(db, record_id, request, brain=brain)
    return True


def demo_assets():
    """(filename, builder, description, linked to the relato)."""
    from .demo_assets import CAPTURA_01, CAPTURA_02, CORREO_LINES, chat_png, room_png, text_pdf
    return [("captura_01.png", chat_png, CAPTURA_01, True),
            ("correo_01.pdf", lambda: text_pdf(CORREO_LINES), None, True),
            ("captura_02.png", room_png, CAPTURA_02, False)]


def attach_missing_files(db, store, record_id):
    """Adds only the evidence that is not there yet, so a half-created case is completed on re-run."""
    from . import files
    from .files import FileMetadata
    account = db.scalar(select(Account).where(Account.record_id == record_id).order_by(Account.created_at, Account.id))
    present = set(db.scalars(select(RecordFile.filename).where(RecordFile.record_id == record_id)))
    missing = [asset for asset in demo_assets() if asset[0] not in present]
    for filename, build, description, linked in missing:
        files.persist_file(db, store, record_id, filename, build(),
                           FileMetadata(description=description, account_ids=[account.id] if linked else []))
    return bool(missing)


def seed_demo_case():
    """SPEC Issue 8, prototype narrative: María's private situation plus three earlier cases received by
    Empresa Andina S.A.C., so the new submission becomes V-004. Synthetic only; idempotent and self-repairing."""
    from .storage import get_storage
    require_demo()
    maria, andina, record_id = demo_id("maria@example.test"), demo_id(ANDINA), demo_id(MARIA_RECORD)
    store = get_storage()
    with SessionLocal() as db:
        ensure_profile(db, maria, andina)
        ensure_record(db, record_id, maria)
        conversation_record = ensure_conversation_record(db, maria)
        db.commit()
        seed_history(db, store, andina)
        added_conversation = ensure_conversation(db, conversation_record)
        added = attach_missing_files(db, store, record_id)
    if added or added_conversation:
        print("Situación ficticia preparada para María X.")
    else:
        print("La situación ficticia ya existe. No se modificó.")
    return record_id


class HistoricalCase(NamedTuple):
    case_id: str
    received: str
    status: str
    assignee: str
    affected: tuple[str, str, str]
    respondent: tuple[str, str]
    events: list[tuple[str | None, str | None, str]]
    attachments: list[tuple[str, str]]
    measures: list[tuple[str, str]]
    steps: list[str]


HISTORY = [
    HistoricalCase("V-001", "2026-09-22T10:05:00+00:00", "in_review", "andrea@example.test",
                   ("Rosa P.", "Asistente", "Ventas"), ("Luis T.", "Coordinador"),
                   [("2026-09-08", None, "Comentarios en reunión de equipo"), ("2026-09-12", None, "Mensajes por chat interno"),
                    (None, "mediados de septiembre", "Reunión uno a uno")],
                   [("chat_interno.pdf", "application/pdf"), ("captura_equipo.png", "image/png")],
                   [("reporting_line", "Cambio de línea de reporte")],
                   ["done", "done", "in_progress", "pending", "pending", "pending", "pending"]),
    HistoricalCase("V-002", "2026-09-18T15:30:00+00:00", "follow_up", "carlos@example.test",
                   ("Ana G.", "Operaria", "Almacén"), ("Pedro S.", "Jefe de turno"),
                   [("2026-09-02", None, "Comentario en almacén"), ("2026-09-09", None, "Mensaje de voz")],
                   [("mensaje_voz.m4a", "audio/mp4")],
                   [("no_contact", "Impedimento de acercamiento o contacto")],
                   ["done", "done", "done", "done", "in_progress", "pending", "in_progress"]),
    HistoricalCase("V-003", "2026-09-04T09:00:00+00:00", "closed", "andrea@example.test",
                   ("Carla V.", "Analista", "Finanzas"), ("Jorge L.", "Analista"),
                   [("2026-08-14", None, "Correo fuera de horario")],
                   [("correo_ago.pdf", "application/pdf")], [], ["done"] * 7),
]


def ensure_history_user(db):
    """Inactive placeholder submitter: it cannot sign in and owns no private data."""
    from uuid import uuid4
    user_id = demo_id("historial@example.test")
    if db.get(User, user_id) is None:
        db.add(User(id=user_id, email="historial@example.test", name="Casos anteriores (sintéticos)",
                    password_hash=passwords.hash(uuid4().hex + uuid4().hex), active=False))
        db.flush()
    return user_id


def history_files(spec, store, at):
    import hashlib
    from uuid import uuid4
    from .demo_assets import placeholder_file
    copies = []
    for filename, media_type in spec.attachments:
        data = placeholder_file(filename)
        key = f"cases/{uuid4().hex}"
        store.put(key, data)
        copies.append(CaseFile(id=str(uuid4()), source_file_id=str(uuid4()), filename=filename, media_type=media_type,
                               sha256=hashlib.sha256(data).hexdigest(), storage_key=key, created_at=at))
    return copies


def history_snapshot(spec, institution_id, files):
    field = lambda value: {"value": value, "origin": "person" if value else None}
    name, position, area = spec.affected
    return {
        "schema": "vera.case.v2", "case_id": spec.case_id, "submitted_at": spec.received, "institution_id": institution_id,
        "summary": f"Caso recibido con {len(spec.events)} {'evento' if len(spec.events) == 1 else 'eventos'} y "
                   f"{len(files)} {'archivo' if len(files) == 1 else 'archivos'} seleccionados por la persona.",
        "affected": {"name": field(name), "position": field(position), "area": field(area)},
        "respondent": {"name": field(spec.respondent[0]), "position": field(spec.respondent[1])}, "respondent_confirmed": True,
        "reporter": {"same_as_affected": True, "name": field(name)},
        "facts": {"events": [{"title": title, "description": "", "date_kind": "exact" if day else "approximate",
                              "event_date": day, "approximate_date": approx, "event_time": None, "sources": []}
                             for day, approx, title in spec.events], "consequences": field(None)},
        "evidence": [{"file_id": item.id, "filename": item.filename, "media_type": item.media_type, "sha256": item.sha256}
                     for item in files],
        "protection_measures": {"selected": [{"code": code, "label": label} for code, label in spec.measures], "other": None},
    }


def history_case(spec, institution_id, submitter, store):
    from uuid import uuid4
    from .procedure import STEPS
    at = datetime.fromisoformat(spec.received)
    assignee = demo_id(spec.assignee)
    case = InstitutionalCase(id=str(uuid4()), case_id=spec.case_id, institution_id=institution_id, submitted_by=submitter,
                             submitted_at=at, status=spec.status, assignee_id=assignee, created_at=at, snapshot_json={},
                             procedure_json={key: {"status": state, "updated_at": spec.received, "updated_by": assignee}
                                             for (key, _, _, _), state in zip(STEPS, spec.steps)})
    case.files.extend(history_files(spec, store, at))
    case.snapshot_json = history_snapshot(spec, institution_id, case.files)
    return case


def seed_history(db, store, institution_id):
    """Earlier synthetic cases, so Institutional shows a realistic queue. Only created when absent."""
    submitter = ensure_history_user(db)
    existing = set(db.scalars(select(InstitutionalCase.case_id).where(InstitutionalCase.institution_id == institution_id)))
    for spec in HISTORY:
        if spec.case_id not in existing:
            db.add(history_case(spec, institution_id, submitter, store))
    db.commit()


if __name__ == "__main__":
    seed()
    seed_demo_case()
