"""Private timeline HTTP API: propose, review and annotate events. Sources and verification live elsewhere."""
from copy import deepcopy
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .accounts import AccountInput, owned_account
from .config import settings
from .db import get_db
from .files import owned_file
from .models import PrivateRecord, Timeline, User
from .proposals import CONTENT, propose, review_item, short_title
from .records import owned_record
from .security import current_user
from .sources import collect, description_version
from .storage import get_storage, PrivateStorage
from .timeline_ai import get_timeline_adapter, TimelineAdapter

router = APIRouter(prefix="/api/records/{record_id}/timeline", tags=["Cronología privada"])


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)


class Review(AccountInput):
    revision: int = Field(ge=0)
    status: Literal["accepted", "discarded", "proposed"]
    title: str | None = Field(default=None, max_length=200)


class ItemReview(Revision):
    status: Literal["open", "resolved", "dismissed"]


class ManualEvent(AccountInput):
    """A fact the person adds themselves (decision D2). Dates follow the same exact/approximate/unknown rules."""
    revision: int = Field(ge=0)
    title: str = Field(min_length=1, max_length=200)


PERSON = "person"


def state(row, mode):
    return {"revision": row.revision if row else 0,
            "confirmed": bool(row and row.confirmed_revision == row.revision),
            "mode": row.mode if row else mode,
            "configured_mode": mode,
            "events": row.events if row else [], "warnings": row.warnings if row else [],
            "review_items": (row.review_items or []) if row else [],
            "processed_at": row.processed_at.isoformat() if row else None}


def lock(db, record_id, user, revision):
    """Owner check plus a row lock; rejects writes based on a stale revision."""
    owned_record(db, record_id, user)
    db.execute(select(PrivateRecord).where(PrivateRecord.id == str(record_id)).with_for_update()).scalar_one()
    row = db.get(Timeline, str(record_id))
    if (row.revision if row else 0) != revision:
        raise HTTPException(409, "La cronología cambió en otra ventana. Recarga antes de continuar")
    return row


def event_sources(event):
    return event.get('sources') or [event['source']]


def is_manual(event):
    return event.get('mode') == PERSON


def person_source(event_id, content):
    """The person is the source of what they add: no quote to verify, nothing proposed by VERA."""
    return {"id": f"manual:{event_id}", "kind": PERSON, "source_id": event_id, "label": "Agregado por ti",
            "quote": content['description'], "page": None, "version": None, "field": None,
            "date": {key: content[key] for key in ('date_kind', 'event_date', 'approximate_date')}}


def manual_event(data):
    content = {**data.model_dump(mode='json', include={'description', 'date_kind', 'event_date', 'approximate_date'}),
               "title": data.title, "event_time": None}
    event_id = str(uuid4())
    source = person_source(event_id, content)
    return {"id": event_id, "source": source, "sources": [source], "support_quotes": [], "original": dict(content), **content,
            "status": "accepted", "reviewed": True, "edited": False, "needs_review": False, "mode": PERSON}


def find_event(events, event_id):
    event = next((item for item in events if item['id'] == str(event_id)), None)
    if event is None:
        raise HTTPException(404, "Evento no encontrado")
    return event


def bump(row, db):
    """Every change to event content creates a new revision (drafts built on the old one become stale)."""
    row.revision += 1
    row.confirmed_revision = None
    db.commit()


def new_event(proposal, mode):
    original = {key: proposal[key] for key in CONTENT}
    return {"id": str(uuid4()), "source": proposal['sources'][0], "sources": proposal['sources'],
            "support_quotes": proposal['support_quotes'], "original": original, **original,
            "status": "proposed", "reviewed": False, "edited": False, "needs_review": True, "mode": mode}


def merge_proposals(row, proposed, mode):
    """Keeps everything the person reviewed; adds proposals whose sources are not already covered."""
    kept = [deepcopy(event) for event in row.events if event['reviewed']] if row else []
    covered = {source['id'] for event in kept for source in event_sources(event)}
    return kept + [new_event(p, mode) for p in proposed if not covered & {s['id'] for s in p['sources']}]


def unlinked_evidence(files, events):
    linked = {s['source_id'] for event in events if event['status'] != 'discarded'
              for s in event_sources(event) if s['kind'] == 'file'}
    return [review_item("unlinked_evidence", f"{file.filename} todavía no está asociado a ningún evento.", file_id=file.id)
            for file in files if file.id not in linked]


def link_review_items(items, events, row):
    """Points each notice at its events and keeps the status the person already gave it."""
    previous = {item['id']: item['status'] for item in (row.review_items or [])} if row else {}
    unique = {item['id']: item for item in items}.values()
    return [{**item, "status": previous.get(item['id'], "open"),
             "event_ids": [e['id'] for e in events if {s['id'] for s in event_sources(e)} & set(item['source_ids'])]}
            for item in unique]


def analysis_warnings(warnings, dropped, mode, sources, proposed):
    extra = [f"Se descartaron {dropped} propuesta(s) sin fuente verificable."] if dropped else []
    if mode == "extractive" and len(sources) > len(proposed):
        extra.append("La propuesta es una selección de fragmentos, no una reconstrucción completa. Revisa las fuentes.")
    return warnings + extra


def store_analysis(db, record_id, row, events, warnings, items, mode):
    now = datetime.now(timezone.utc)
    if row is None:
        row = Timeline(record_id=str(record_id), revision=0, mode=mode, events=[], warnings=[], review_items=[], processed_at=now)
        db.add(row)
    row.events, row.warnings, row.review_items, row.mode, row.processed_at = events, warnings, items, mode, now
    bump(row, db)
    return row


@router.get("")
def read(record_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db),
         adapter: TimelineAdapter = Depends(get_timeline_adapter)):
    owned_record(db, record_id, user)
    return state(db.get(Timeline, str(record_id)), adapter.mode)


@router.post("/analyze")
def analyze(record_id: UUID, data: Revision, user: User = Depends(current_user), db: Session = Depends(get_db),
            store: PrivateStorage = Depends(get_storage), adapter: TimelineAdapter = Depends(get_timeline_adapter)):
    row = lock(db, record_id, user, data.revision)
    sources, warnings, files = collect(db, record_id, store)
    result = propose(adapter, sources, settings().demo_enabled)
    if result is None:
        raise HTTPException(503, "No pudimos organizar la cronología. Tus relatos y revisiones siguen guardados. Intenta nuevamente")
    proposed, items, dropped, mode = result
    events = merge_proposals(row, proposed, mode)
    items = link_review_items(items + unlinked_evidence(files, events), events, row)
    row = store_analysis(db, record_id, row, events, analysis_warnings(warnings, dropped, mode, sources, proposed), items, mode)
    return state(row, adapter.mode)


def apply_resolution(events, item, status):
    """A resolved notice may annotate its events; reopening it removes that annotation."""
    for event in events:
        if event['id'] not in item.get('event_ids', []):
            continue
        if status == 'resolved':
            event['note'] = item['resolution_note']
        elif event.get('note') == item['resolution_note']:
            event.pop('note')


@router.put("/review-items/{item_id}")
def review_item_status(record_id: UUID, item_id: str, data: ItemReview, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    row = lock(db, record_id, user, data.revision)
    items = deepcopy(row.review_items or []) if row else []
    item = next((value for value in items if value['id'] == item_id), None)
    if item is None:
        raise HTTPException(404, "Aviso no encontrado")
    item['status'] = data.status
    if item.get('resolution_note'):
        events = deepcopy(row.events)
        apply_resolution(events, item, data.status)
        row.events = events
    # Handling a notice does not change event content, so the timeline revision stays the same.
    row.review_items = items
    db.commit()
    return state(row, row.mode)


def reviewed_content(data, event):
    content = data.model_dump(mode='json', include={'description', 'date_kind', 'event_date', 'approximate_date'})
    content['title'] = data.title or event.get('title') or short_title(data.description)
    # A clock time only survives while the exact date it belongs to is unchanged.
    content['event_time'] = event.get('event_time') if content['event_date'] == event.get('event_date') else None
    return content


def is_edited(content, original):
    return any(content[key] != original.get(key, content[key] if key in ('title', 'event_time') else None) for key in CONTENT)


@router.put("/events/{event_id}")
def review(record_id: UUID, event_id: UUID, data: Review, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = lock(db, record_id, user, data.revision)
    events = deepcopy(row.events) if row else []
    event = find_event(events, event_id)
    content = reviewed_content(data, event)
    event.update(content, status=data.status, reviewed=True, edited=is_edited(content, event['original']))
    if is_manual(event):
        event['source'] = person_source(event['id'], content)
        event['sources'] = [event['source']]
    row.events = events
    bump(row, db)
    return state(row, row.mode)


@router.post("/events", status_code=201)
def add_event(record_id: UUID, data: ManualEvent, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = lock(db, record_id, user, data.revision)
    if row is None:
        raise HTTPException(409, "Primero deja que VERA organice tus fuentes; luego podrás agregar hechos propios")
    row.events = [*deepcopy(row.events), manual_event(data)]
    bump(row, db)
    return state(row, row.mode)


def without_event(items, event_id):
    return [{**item, "event_ids": [value for value in item.get('event_ids', []) if value != event_id]} for item in items]


@router.delete("/events/{event_id}")
def remove_event(record_id: UUID, event_id: UUID, revision: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = lock(db, record_id, user, revision)
    event = find_event(row.events if row else [], event_id)
    if not is_manual(event):
        # Proposals stay in the timeline as discarded, so the review trail is never rewritten.
        raise HTTPException(422, "Las propuestas de VERA se descartan, no se eliminan")
    row.events = [deepcopy(item) for item in row.events if item['id'] != event['id']]
    row.review_items = without_event(row.review_items or [], event['id'])
    bump(row, db)
    return state(row, row.mode)


@router.post("/confirm")
def confirm(record_id: UUID, data: Revision, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = lock(db, record_id, user, data.revision)
    if row is None or not any(e['status'] == 'accepted' for e in row.events):
        raise HTTPException(422, "Acepta al menos un evento para confirmar la cronología")
    if any(e['status'] == 'proposed' for e in row.events):
        raise HTTPException(422, "Revisa, acepta o descarta todas las propuestas antes de confirmar")
    row.confirmed_revision = row.revision
    db.commit()
    return state(row, row.mode)


def current_version(db, record_id, ref, user):
    """(current text, current version) of the document a fragment came from."""
    if ref['kind'] == 'file':
        current = owned_file(db, record_id, ref['source_id'], user)
        if ref.get('field') == 'description':
            return current.description, description_version(current.description)
        return None, current.sha256
    current = owned_account(db, record_id, ref['source_id'], user) if ref['kind'] == 'account' else owned_record(db, record_id, user)
    return current.description, current.updated_at.isoformat()


@router.get("/events/{event_id}/source")
def source(record_id: UUID, event_id: UUID, source: str | None = None, user: User = Depends(current_user),
           db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    row = db.get(Timeline, str(record_id))
    event = find_event(row.events if row else [], event_id)
    ref = next((item for item in event_sources(event) if source is None or item['id'] == source), None)
    if ref is None:
        raise HTTPException(404, "Fuente no encontrada")
    if ref['kind'] == PERSON:
        return {**ref, "current_text": event['description'], "changed": False}
    text, version = current_version(db, record_id, ref, user)
    return {**ref, "current_text": text, "changed": version != ref['version']}
