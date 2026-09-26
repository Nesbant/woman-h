"""The single bridge from Private to Institutional (SPEC §41): freezes a snapshot of what the person selected."""
from datetime import datetime, timezone
import hashlib
import logging
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .db import get_db
from .draft_fields import MEASURES, RESPONDENT, field
from .drafts import locked, revision_of
from .models import CaseFile, Institution, InstitutionalCase, RecordFile, RecordSubmission, Timeline, User
from .procedure import initial_procedure
from .security import current_user
from .storage import PrivateStorage, get_storage

router = APIRouter(prefix="/api/records/{record_id}", tags=["Borrador y envío"])
organizations = APIRouter(prefix="/api/organizations", tags=["Borrador y envío"])
logger = logging.getLogger(__name__)


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    draft_revision: int = Field(ge=1)
    event_ids: list[str] = Field(default_factory=list, max_length=50)
    file_ids: list[UUID] = Field(default_factory=list, max_length=20)
    institution_id: UUID


def plural(n, one, many):
    return f"{n} {one if n == 1 else many}"


def checked_draft(db, record_id, user, data):
    """The reviewed draft the person is sending, built on the current timeline."""
    draft = locked(db, record_id, user)
    if draft is None or draft.revision != data.draft_revision:
        raise HTTPException(409, "El borrador cambió. Revísalo nuevamente antes de enviar")
    if draft.reviewed_at is None:
        raise HTTPException(422, "Revisa lo que verá la organización antes de enviar")
    if draft.timeline_revision != revision_of(db.get(Timeline, str(record_id))):
        # Never send facts the person discarded or changed after preparing the draft.
        raise HTTPException(409, "Tu cronología cambió después de preparar el borrador. Actualiza el borrador antes de enviar")
    return draft


def selected_facts(draft, event_ids):
    facts = {fact['event_id']: fact for fact in draft.fields_json['facts']['events']}
    if len(set(event_ids)) != len(event_ids) or not set(event_ids) <= set(facts):
        raise HTTPException(422, "Solo puedes compartir hechos de tu borrador")
    return [facts[key] for key in event_ids]


def selected_files(db, record_id, file_ids):
    ids = list(dict.fromkeys(str(value) for value in file_ids))
    files = db.scalars(select(RecordFile).where(RecordFile.record_id == str(record_id), RecordFile.id.in_(ids))).all()
    if len(files) != len(ids):
        raise HTTPException(422, "Uno de los archivos no pertenece a este registro")
    return sorted(files, key=lambda item: (item.created_at, item.id))


def locked_institution(db, institution_id):
    institution = db.execute(select(Institution).where(Institution.id == str(institution_id)).with_for_update()).scalar_one_or_none()
    if institution is None:
        raise HTTPException(404, "Organización no encontrada")
    return institution


def next_case_id(db, institution):
    count = db.scalar(select(func.count()).select_from(InstitutionalCase).where(InstitutionalCase.institution_id == institution.id))
    return f"V-{count + 1:03d}"


def copy_file(store, file):
    """Copy the private original to a new institutional key. Hashes must match before and after."""
    data = store.read(file.original_key)
    if hashlib.sha256(data).hexdigest() != file.sha256:
        raise HTTPException(409, f"{file.filename} no coincide con su huella original. No se envió nada")
    key = f"cases/{uuid4().hex}"
    store.put(key, data)
    if hashlib.sha256(store.read(key)).hexdigest() != file.sha256:
        store.delete(key)
        raise HTTPException(503, "No se pudo copiar la evidencia de forma íntegra. No se envió nada")
    return key


def attach_copies(case, store, files, now, written):
    for file in files:
        key = copy_file(store, file)
        written.append(key)
        case.files.append(CaseFile(id=str(uuid4()), source_file_id=file.id, filename=file.filename,
                                   media_type=file.media_type, sha256=file.sha256, storage_key=key, created_at=now))


def shared_label(source, shared_files):
    if source['kind'] != 'file':
        return "Relato de la persona"
    return source['label'] if source['source_id'] in shared_files else "Evidencia no compartida"


def snapshot_fact(fact, shared_files):
    return {"title": fact.get('title'), "description": fact['description'], "date_kind": fact['date_kind'],
            "event_date": fact['event_date'], "approximate_date": fact['approximate_date'], "event_time": fact.get('event_time'),
            "sources": sorted({shared_label(s, shared_files) for s in fact['sources']})}


def build_snapshot(case, institution, draft, facts, now):
    """Frozen, limited copy: no record id, no relato text, no quotes, no unselected files, no unconfirmed identity."""
    fields = draft.fields_json
    confirmed = bool(fields.get('respondent_confirmed'))
    shared_files = {item.source_file_id for item in case.files}
    return {
        "schema": "vera.case.v2", "case_id": case.case_id, "submitted_at": now.isoformat(),
        "institution_id": institution.id, "draft_revision": draft.revision,
        "summary": f"Caso recibido con {plural(len(facts), 'evento', 'eventos')} y {plural(len(case.files), 'archivo', 'archivos')} "
                   "seleccionados por la persona. El contenido corresponde al snapshot autorizado.",
        "affected": fields['affected'],
        "respondent": {key: fields['respondent'][key] if confirmed else field() for key in RESPONDENT},
        "respondent_confirmed": confirmed,
        "reporter": fields['reporter'],
        "facts": {"events": [snapshot_fact(fact, shared_files) for fact in facts], "consequences": fields['facts']['consequences']},
        "evidence": [{"file_id": item.id, "filename": item.filename, "media_type": item.media_type, "sha256": item.sha256}
                     for item in case.files],
        "protection_measures": {"selected": [{"code": code, "label": MEASURES[code][0]} for code in fields['protection_measures']['selected']],
                                "other": fields['protection_measures']['other']},
    }


def receipt(record_id, case, institution, draft, facts, now):
    """Private-side record of what was sent. The institution never reaches back to it."""
    return RecordSubmission(id=str(uuid4()), record_id=str(record_id), case_id=case.case_id, institution_name=institution.name,
                            submitted_at=now, summary={"events": len(facts), "draft_revision": draft.revision,
                                                       "files": [{"filename": item.filename, "sha256": item.sha256} for item in case.files]})


def discard_copies(store, keys):
    for key in keys:
        try:
            store.delete(key)
        except Exception:
            logger.exception("Copia institucional pendiente de limpieza")


def create_case(db, store, record_id, user, draft, facts, files, institution):
    now = datetime.now(timezone.utc)
    case = InstitutionalCase(id=str(uuid4()), case_id=next_case_id(db, institution), institution_id=institution.id,
                             submitted_by=user.id, submitted_at=now, status="new", assignee_id=None,
                             procedure_json=initial_procedure(), created_at=now, snapshot_json={})
    written = []
    try:
        attach_copies(case, store, files, now, written)
        case.snapshot_json = build_snapshot(case, institution, draft, facts, now)
        db.add(case)
        db.add(receipt(record_id, case, institution, draft, facts, now))
        db.commit()
    except Exception as error:
        db.rollback()
        discard_copies(store, written)
        if isinstance(error, HTTPException):
            raise
        logger.exception("No se pudo crear el caso institucional")
        raise HTTPException(503, "No se pudo enviar. Nada fue compartido; intenta nuevamente")
    return case, now


@router.post("/submit", status_code=201)
def submit(record_id: UUID, data: Submission, user: User = Depends(current_user), db: Session = Depends(get_db),
           store: PrivateStorage = Depends(get_storage)):
    draft = checked_draft(db, record_id, user, data)
    facts = selected_facts(draft, data.event_ids)
    files = selected_files(db, record_id, data.file_ids)
    institution = locked_institution(db, data.institution_id)
    case, now = create_case(db, store, record_id, user, draft, facts, files, institution)
    return {"case_id": case.case_id, "institution_id": institution.id, "institution_name": institution.name,
            "submitted_at": now.isoformat(), "shared": {"events": len(facts), "files": len(case.files)},
            "files": [{"filename": item.filename, "sha256": item.sha256} for item in case.files]}


@organizations.get("")
def list_organizations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"id": item.id, "name": item.name} for item in db.scalars(select(Institution).order_by(Institution.name))]
