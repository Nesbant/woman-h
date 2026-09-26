"""Private complaint draft (SPEC §17) and the single bridge to Institutional (SPEC §41).

The draft is built ONLY from the confirmed timeline and the person's profile. Missing data stays empty:
nothing is guessed. Submitting freezes a snapshot of the explicitly selected events and files.
"""
from datetime import datetime, timezone
import hashlib
import logging
from typing import Literal
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .db import get_db
from .models import Account, CaseFile, ComplaintDraft, Institution, InstitutionalCase, PrivateRecord, RecordFile, Timeline, User
from .procedure import initial_procedure
from .records import owned_record
from .security import current_user
from .storage import PrivateStorage, get_storage

router = APIRouter(prefix="/api/records/{record_id}", tags=["Borrador y envío"])
organizations = APIRouter(prefix="/api/organizations", tags=["Borrador y envío"])
logger = logging.getLogger(__name__)

# DS 014-2019-MIMP: VERA only lists options; the person chooses and the organization decides.
MEASURES = {
    "respondent_rotation": "Rotación o cambio de lugar de la persona denunciada",
    "respondent_suspension": "Suspensión temporal de la persona denunciada",
    "affected_rotation": "Rotación o cambio de lugar de la persona afectada, a su solicitud",
    "no_contact_order": "Solicitud de impedimento de acercamiento o comunicación",
    "other": "Otra medida para proteger el bienestar de la persona afectada",
}
AFFECTED = ("name", "document", "contact", "position", "area", "relationship")
RESPONDENT = ("name", "position", "area", "relationship")


class FieldValue(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    value: str | None = Field(default=None, max_length=2000)


class FactEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    event_id: str = Field(max_length=36)
    description: str = Field(min_length=1, max_length=2000)


class DraftEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    revision: int = Field(ge=1)
    affected: dict[Literal[AFFECTED], FieldValue]
    respondent: dict[Literal[RESPONDENT], FieldValue]
    reporter_same_as_affected: bool
    reporter_name: FieldValue
    facts: list[FactEdit] = Field(max_length=50)
    consequences: FieldValue
    measures: list[Literal[tuple(MEASURES)]] = Field(max_length=len(MEASURES))
    measures_other: str | None = Field(default=None, max_length=1000)


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    draft_revision: int = Field(ge=1)
    event_ids: list[str] = Field(min_length=1, max_length=50)
    file_ids: list[UUID] = Field(default_factory=list, max_length=20)
    institution_id: UUID


def field(value=None, origin=None):
    return {"value": value, "origin": origin if value else None}


def utc(value):
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat() if value else None


def chronological(event):
    rank = {"exact": 0, "approximate": 1, "unknown": 2}[event['date_kind']]
    return rank, event['event_date'] or ""


def facts_from(timeline, previous):
    kept = {fact['event_id']: fact for fact in previous}
    facts = []
    for event in sorted((e for e in timeline.events if e['status'] == 'accepted'), key=chronological):
        # One reference per document: several quoted fragments of the same relato count once.
        refs = list({(s['kind'], s['source_id'], s['label']): {"kind": s['kind'], "source_id": s['source_id'], "label": s['label']}
                     for s in (event.get('sources') or [event['source']])}.values())
        fact = {"event_id": event['id'], "description": event['description'], "date_kind": event['date_kind'],
                "event_date": event['event_date'], "approximate_date": event['approximate_date'],
                "sources": refs, "edited": False}
        old = kept.get(event['id'])
        if old and old['edited']:
            fact.update(description=old['description'], edited=True)
        facts.append(fact)
    return facts


def build_fields(db, record_id, user, timeline, previous=None):
    previous = previous or {}
    mentioned = db.scalars(select(Account.mentioned_people).where(
        Account.record_id == str(record_id), Account.mentioned_people.is_not(None))).all()
    facts = facts_from(timeline, previous.get('facts', {}).get('events', []))
    files = {s['source_id'] for fact in facts for s in fact['sources'] if s['kind'] == 'file'}
    fields = {
        "affected": previous.get('affected') or {**{key: field() for key in AFFECTED},
                                                 "name": field(user.name, "profile"), "contact": field(user.email, "profile")},
        # Names found in the person's own relatos are only suggestions: never filled automatically (SPEC §5.II).
        "respondent": {**(previous.get('respondent') or {key: field() for key in RESPONDENT}),
                       "suggestions": sorted(set(mentioned))},
        "reporter": previous.get('reporter') or {"same_as_affected": True, "name": field(user.name, "profile")},
        "facts": {"events": facts, "consequences": previous.get('facts', {}).get('consequences') or field()},
        "evidence": {"file_ids": sorted(files)},
        "protection_measures": previous.get('protection_measures') or {"selected": [], "other": None},
    }
    source_map = {f"facts.{fact['event_id']}": [s['label'] for s in fact['sources']] for fact in facts}
    source_map.update({f"affected.{key}": "Perfil" for key, value in fields['affected'].items() if value['origin'] == "profile"})
    return fields, source_map


def missing(fields):
    gaps = [f"affected.{key}" for key, value in fields['affected'].items() if not value['value']]
    gaps += [f"respondent.{key}" for key in RESPONDENT if not fields['respondent'][key]['value']]
    gaps += [f"facts.{fact['event_id']}.date" for fact in fields['facts']['events'] if fact['date_kind'] != 'exact']
    if not fields['protection_measures']['selected']:
        gaps.append("protection_measures")
    return gaps


def draft_state(draft, timeline):
    confirmed = bool(timeline and timeline.confirmed_revision == timeline.revision)
    base = {"timeline_confirmed": confirmed, "timeline_revision": timeline.revision if timeline else 0,
            "measure_options": MEASURES}
    if draft is None:
        return {**base, "draft": None}
    return {**base, "draft": {
        "revision": draft.revision, "timeline_revision": draft.timeline_revision,
        "stale": draft.timeline_revision != (timeline.revision if timeline else 0),
        "fields": draft.fields_json, "source_map": draft.source_map, "missing": missing(draft.fields_json),
        "reviewed": draft.reviewed_at is not None, "reviewed_at": utc(draft.reviewed_at), "updated_at": utc(draft.updated_at)}}


def locked(db, record_id, user):
    owned_record(db, record_id, user)
    db.execute(select(PrivateRecord).where(PrivateRecord.id == str(record_id)).with_for_update()).scalar_one()
    return db.scalar(select(ComplaintDraft).where(ComplaintDraft.record_id == str(record_id)))


@router.get("/complaint")
def read_draft(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    draft = db.scalar(select(ComplaintDraft).where(ComplaintDraft.record_id == str(record_id)))
    return draft_state(draft, db.get(Timeline, str(record_id)))


@router.post("/complaint/generate")
def generate(record_id: UUID, data: Revision, user: User = Depends(current_user), db: Session = Depends(get_db)):
    draft = locked(db, record_id, user)
    timeline = db.get(Timeline, str(record_id))
    if timeline is None or timeline.confirmed_revision != timeline.revision:
        raise HTTPException(422, "Confirma tu cronología revisada antes de preparar el borrador")
    if timeline.revision != data.revision:
        raise HTTPException(409, "La cronología cambió en otra ventana. Recarga antes de continuar")
    fields, source_map = build_fields(db, record_id, user, timeline, draft.fields_json if draft else None)
    now = datetime.now(timezone.utc)
    if draft is None:
        draft = ComplaintDraft(id=str(uuid4()), record_id=str(record_id), revision=0, created_at=now)
        db.add(draft)
    draft.fields_json, draft.source_map, draft.timeline_revision = fields, source_map, timeline.revision
    draft.revision, draft.reviewed_at, draft.updated_at = draft.revision + 1, None, now
    db.commit()
    return draft_state(draft, timeline)


@router.put("/complaint")
def edit(record_id: UUID, data: DraftEdit, user: User = Depends(current_user), db: Session = Depends(get_db)):
    draft = locked(db, record_id, user)
    if draft is None or draft.revision != data.revision:
        raise HTTPException(409, "El borrador cambió en otra ventana. Recarga antes de continuar")
    fields = draft.fields_json

    def merged(current, incoming):
        value = incoming.value or None
        return current if value == current['value'] else field(value, "person")
    fields = {**fields,
              "affected": {key: merged(fields['affected'][key], data.affected.get(key, FieldValue(value=fields['affected'][key]['value'])))
                           for key in AFFECTED},
              "respondent": {**fields['respondent'], **{
                  key: merged(fields['respondent'][key], data.respondent.get(key, FieldValue(value=fields['respondent'][key]['value'])))
                  for key in RESPONDENT}},
              "reporter": {"same_as_affected": data.reporter_same_as_affected,
                           "name": merged(fields['reporter']['name'], data.reporter_name)},
              "protection_measures": {"selected": sorted(set(data.measures)), "other": data.measures_other or None}}
    edits = {fact.event_id: fact.description for fact in data.facts}
    if not set(edits) <= {fact['event_id'] for fact in fields['facts']['events']}:
        raise HTTPException(422, "Solo puedes editar hechos de tu cronología confirmada")
    events = [{**fact, "description": edits[fact['event_id']], "edited": True}
              if fact['event_id'] in edits and edits[fact['event_id']] != fact['description'] else fact
              for fact in fields['facts']['events']]
    fields['facts'] = {"events": events, "consequences": merged(fields['facts']['consequences'], data.consequences)}
    draft.fields_json = fields
    draft.revision += 1
    draft.reviewed_at = None
    draft.updated_at = datetime.now(timezone.utc)
    db.commit()
    return draft_state(draft, db.get(Timeline, str(record_id)))


@router.post("/complaint/review")
def mark_reviewed(record_id: UUID, data: Revision, user: User = Depends(current_user), db: Session = Depends(get_db)):
    draft = locked(db, record_id, user)
    if draft is None or draft.revision != data.revision:
        raise HTTPException(409, "El borrador cambió en otra ventana. Recarga antes de continuar")
    draft.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return draft_state(draft, db.get(Timeline, str(record_id)))


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


def shared_label(source, shared_files):
    if source['kind'] != 'file':
        return "Relato de la persona"
    return source['label'] if source['source_id'] in shared_files else "Evidencia no compartida"


@router.post("/submit", status_code=201)
def submit(record_id: UUID, data: Submission, user: User = Depends(current_user), db: Session = Depends(get_db),
           store: PrivateStorage = Depends(get_storage)):
    draft = locked(db, record_id, user)
    if draft is None or draft.revision != data.draft_revision:
        raise HTTPException(409, "El borrador cambió. Revísalo nuevamente antes de enviar")
    if draft.reviewed_at is None:
        raise HTTPException(422, "Revisa lo que verá la organización antes de enviar")
    timeline = db.get(Timeline, str(record_id))
    if timeline is None or timeline.confirmed_revision != timeline.revision or draft.timeline_revision != timeline.revision:
        # Never send facts the person discarded or changed after preparing the draft.
        raise HTTPException(409, "Tu cronología cambió después de preparar el borrador. Confírmala y actualiza el borrador antes de enviar")
    facts = {fact['event_id']: fact for fact in draft.fields_json['facts']['events']}
    if len(set(data.event_ids)) != len(data.event_ids) or not set(data.event_ids) <= set(facts):
        raise HTTPException(422, "Solo puedes compartir hechos de tu borrador")
    file_ids = list(dict.fromkeys(str(value) for value in data.file_ids))
    files = db.scalars(select(RecordFile).where(RecordFile.record_id == str(record_id), RecordFile.id.in_(file_ids))).all()
    if len(files) != len(file_ids):
        raise HTTPException(422, "Uno de los archivos no pertenece a este registro")
    institution = db.execute(select(Institution).where(Institution.id == str(data.institution_id)).with_for_update()).scalar_one_or_none()
    if institution is None:
        raise HTTPException(404, "Organización no encontrada")
    now = datetime.now(timezone.utc)
    count = db.scalar(select(func.count()).select_from(InstitutionalCase).where(InstitutionalCase.institution_id == institution.id))
    case = InstitutionalCase(id=str(uuid4()), case_id=f"V-{count + 1:03d}", institution_id=institution.id,
                             submitted_by=user.id, submitted_at=now, status="new", assignee_id=None,
                             procedure_json=initial_procedure(), created_at=now, snapshot_json={})
    written = []
    try:
        for file in sorted(files, key=lambda item: (item.created_at, item.id)):
            key = copy_file(store, file)
            written.append(key)
            case.files.append(CaseFile(id=str(uuid4()), source_file_id=file.id, filename=file.filename,
                                       media_type=file.media_type, sha256=file.sha256, storage_key=key, created_at=now))
        shared = set(file_ids)
        fields = draft.fields_json
        # Frozen, limited copy: no record id, no relato text, no quotes, no unselected files.
        case.snapshot_json = {
            "schema": "vera.case.v1", "case_id": case.case_id, "submitted_at": now.isoformat(),
            "institution_id": institution.id, "draft_revision": draft.revision,
            "affected": fields['affected'],
            "respondent": {key: fields['respondent'][key] for key in RESPONDENT},
            "reporter": fields['reporter'],
            "facts": {"events": [{"description": fact['description'], "date_kind": fact['date_kind'],
                                  "event_date": fact['event_date'], "approximate_date": fact['approximate_date'],
                                  "sources": sorted({shared_label(s, shared) for s in fact['sources']})}
                                 for fact in (facts[key] for key in data.event_ids)],
                      "consequences": fields['facts']['consequences']},
            "evidence": [{"file_id": item.id, "filename": item.filename, "media_type": item.media_type, "sha256": item.sha256}
                         for item in case.files],
            "protection_measures": {"selected": [{"code": code, "label": MEASURES[code]} for code in fields['protection_measures']['selected']],
                                    "other": fields['protection_measures']['other']},
        }
        db.add(case)
        db.commit()
    except Exception as error:
        db.rollback()
        for key in written:
            try:
                store.delete(key)
            except Exception:
                logger.exception("Copia institucional pendiente de limpieza")
        if isinstance(error, HTTPException):
            raise
        logger.exception("No se pudo crear el caso institucional")
        raise HTTPException(503, "No se pudo enviar. Nada fue compartido; intenta nuevamente")
    return {"case_id": case.case_id, "institution_id": institution.id, "institution_name": institution.name,
            "submitted_at": now.isoformat(), "shared": {"events": len(data.event_ids), "files": len(case.files)}}


@organizations.get("")
def list_organizations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"id": item.id, "name": item.name} for item in db.scalars(select(Institution).order_by(Institution.name))]
