from copy import deepcopy
from datetime import date, datetime, timezone
from hashlib import sha256
import json
import re
import subprocess
import sys
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
from .models import Account, PrivateRecord, RecordFile, Timeline, User
from .records import owned_record
from .security import current_user
from .storage import get_storage, PrivateStorage
from .timeline_ai import fallback_chain, get_timeline_adapter, TimelineAdapter

router = APIRouter(prefix="/api/records/{record_id}/timeline", tags=["Cronología privada"])


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)


class Review(AccountInput):
    revision: int = Field(ge=0)
    status: Literal["accepted", "discarded", "proposed"]


class ItemReview(Revision):
    status: Literal["open", "resolved", "dismissed"]


# Guardrail: proposals never score, judge credibility, attribute intent or suggest sanctions (SPEC §15).
FORBIDDEN = re.compile(r"probabilidad|culpab|credib|cre[ií]ble|sanci[oó]n|despid|intenci[oó]n sexual", re.I)
MAX_EVENTS = 12


def state(row, mode):
    return {"revision": row.revision if row else 0,
            "confirmed": bool(row and row.confirmed_revision == row.revision),
            "mode": row.mode if row else mode,
            "configured_mode": mode,
            "events": row.events if row else [], "warnings": row.warnings if row else [],
            "review_items": (row.review_items or []) if row else [],
            "processed_at": row.processed_at.isoformat() if row else None}


def lock(db, rid, user, revision):
    owned_record(db, rid, user)
    db.execute(select(PrivateRecord).where(PrivateRecord.id == str(rid)).with_for_update()).scalar_one()
    row = db.get(Timeline, str(rid))
    if (row.revision if row else 0) != revision:
        raise HTTPException(409, "La cronología cambió en otra ventana. Recarga antes de continuar")
    return row


def literal_date(text):
    # No resolver fechas relativas ni completar año/día. Solo fechas explícitas inequívocas.
    candidates = re.findall(r"\b(?:\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\b", text)
    if len(candidates) == 1 and not re.search(r"aproxim|quizá|tal vez|no recuerdo|creo", text, re.I):
        value = candidates[0]
        try:
            exact = date.fromisoformat(value if '-' in value else '-'.join(reversed(value.split('/'))))
            return {"date_kind": "exact", "event_date": exact.isoformat(), "approximate_date": None}
        except ValueError:
            pass
    approx = re.search(r"\b(?:a (?:principios|mediados|finales) de|aproximadamente en|alrededor de)\s+[^.;\n]{1,100}", text, re.I)
    return {"date_kind": "approximate" if approx else "unknown", "event_date": None,
            "approximate_date": approx.group(0) if approx else None}


def collect(db, rid, store):
    sources, warnings = [], []
    def add(kind, identifier, label, text, version, page=None, explicit=None, field=None):
        for part in re.split(r"(?<=[.!?])\s+|[\r\n]+", text):
            quote = part.strip()
            if not quote:
                continue
            if len(quote) > 2000:
                warnings.append(f"{label}: un fragmento supera 2000 caracteres; consúltalo en la fuente.")
                continue
            key = sha256(f"{kind}:{identifier}:{page}:{quote}".encode()).hexdigest()
            sources.append({"id": key, "kind": kind, "source_id": identifier, "label": label,
                            "quote": quote, "page": page, "version": version, "field": field,
                            "date": explicit or literal_date(quote)})
    accounts = db.scalars(select(Account).where(Account.record_id == str(rid)).order_by(Account.created_at, Account.id)).all()
    for index, account in enumerate(accounts[:30]):
        explicit = {"date_kind": account.date_kind, "event_date": account.event_date.isoformat() if account.event_date else None,
                    "approximate_date": account.approximate_date} if account.date_kind != 'unknown' else None
        add("account", account.id, f"Relato {index + 1}", account.description,
            account.updated_at.isoformat(), explicit=explicit)
    if len(accounts) > 30:
        warnings.append("Se analizaron los primeros 30 relatos.")
    if not accounts:
        record = db.get(PrivateRecord, str(rid))
        add("record", record.id, "Descripción inicial", record.description, record.updated_at.isoformat())
    files = db.scalars(select(RecordFile).where(RecordFile.record_id == str(rid)).order_by(RecordFile.created_at, RecordFile.id)).all()
    for index, file in enumerate(files):
        if file.description:
            # Lo que la persona escribió sobre el archivo es una fuente propia; no se interpreta la imagen.
            add("file", file.id, f"{file.filename} · tu descripción", file.description,
                description_version(file.description), field="description")
        if index >= 5:
            warnings.append(f"{file.filename}: no analizado; límite de cinco archivos por procesamiento.")
            continue
        if file.media_type != 'application/pdf':
            if not file.description:
                warnings.append(f"{file.filename}: no hay OCR de imágenes. Agrega una descripción para incluirla.")
            continue
        try:
            result = subprocess.run([sys.executable, '-m', 'app.pdf_text'], input=store.read(file.original_key),
                                    capture_output=True, timeout=5, check=True)
            extracted = json.loads(result.stdout)
            if not extracted['pages']:
                warnings.append(f"{file.filename}: no se encontró texto legible. Puedes continuar sin analizarlo.")
            for page in extracted['pages']:
                add("file", file.id, file.filename, page['text'], file.sha256, page['page'])
            if extracted['limited']:
                warnings.append(f"{file.filename}: extracción parcial (máximo 10 páginas y 20 000 caracteres).")
        except Exception:
            warnings.append(f"{file.filename}: no pudo analizarse. El original sigue disponible en Archivos.")
    if len(sources) > 150:
        warnings.append("Se consideraron los primeros 150 fragmentos. Revisa también tus fuentes.")
    return sources[:150], warnings, files


def description_version(text):
    return sha256((text or "").encode()).hexdigest()


def squash(text):
    return " ".join(text.split()).casefold()


def cite(item, sources):
    """Only keep source IDs that exist and quotes that appear literally in some collected fragment.
    Returns the cited sources, the verified quotes and how many quotes could not be verified."""
    by_id = {s['id']: s for s in sources}
    ids = [key for key in item.get('source_ids') or [] if type(key) is str and key in by_id]
    quotes, missing = [], 0
    for quote in item.get('support_quotes') or []:
        if type(quote) is not str or not quote.strip() or len(quote) > 2000:
            missing += 1
            continue
        hits = [s['id'] for s in sources if squash(quote) in squash(s['quote'])]
        if not hits:
            missing += 1
            continue
        quotes.append(quote.strip())
        if not set(hits) & set(ids):
            ids.append(hits[0])
    ids = list(dict.fromkeys(ids))
    if ids and not quotes:
        quotes = [by_id[key]['quote'] for key in ids]
    return [by_id[key] for key in ids], quotes, missing


def checked_date(item, cited):
    kind = item.get('date_kind')
    if kind is None:
        return dict(cited[0]['date'])
    if kind == 'exact' and type(item.get('event_date')) is str:
        try:
            value = date.fromisoformat(item['event_date'])
        except ValueError:
            value = None
        written = value and (value.isoformat(), value.strftime("%d/%m/%Y"))
        if value and any(s['date'].get('event_date') == value.isoformat() or any(w in s['quote'] for w in written)
                         for s in cited):
            return {"date_kind": "exact", "event_date": value.isoformat(), "approximate_date": None}
        # Una fecha exacta sin respaldo literal nunca se guarda: queda pendiente de confirmar.
        return {"date_kind": "unknown", "event_date": None, "approximate_date": None}
    approx = item.get('approximate_date')
    if kind == 'approximate' and type(approx) is str and 0 < len(approx.strip()) <= 200 and not FORBIDDEN.search(approx):
        return {"date_kind": "approximate", "event_date": None, "approximate_date": approx.strip()}
    return {"date_kind": "unknown", "event_date": None, "approximate_date": None}


def verify(proposal, sources, strict=False):
    """strict: every quote must be verified, otherwise the whole item is dropped (used for prepared answers)."""
    if not isinstance(proposal, dict):
        raise ValueError("Propuesta inválida")
    events, items, dropped = [], [], 0
    for raw in (proposal.get('events') or [])[:MAX_EVENTS]:
        cited, quotes, missing = cite(raw, sources) if isinstance(raw, dict) else ([], [], 0)
        description = raw.get('description') if isinstance(raw, dict) else None
        if not cited or (strict and missing) or type(description) is not str or not 0 < len(description.strip()) <= 2000 or FORBIDDEN.search(description):
            dropped += 1
            continue
        events.append({"description": description.strip(), **checked_date(raw, cited), "sources": cited, "support_quotes": quotes})
    for raw in (proposal.get('review_items') or [])[:10]:
        if not isinstance(raw, dict) or raw.get('kind') not in ("date_inconsistency", "possible_relation"):
            continue
        message = raw.get('message')
        cited, _, missing = cite(raw, sources)
        if strict and missing:
            dropped += 1
            continue
        if cited and type(message) is str and 0 < len(message.strip()) <= 500 and not FORBIDDEN.search(message):
            items.append(review_item(raw['kind'], message.strip(), [s['id'] for s in cited]))
    return events, items, dropped


def review_item(kind, message, source_ids=(), file_id=None):
    key = sha256(f"{kind}:{','.join(sorted(source_ids))}:{file_id}".encode()).hexdigest()[:32]
    return {"id": key, "kind": kind, "message": message, "source_ids": list(source_ids),
            "file_id": file_id, "status": "open"}


def event_sources(event):
    return event.get('sources') or [event['source']]


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
    payload = [{"id": s['id'], "text": s['quote']} for s in sources]
    proposed, items, dropped, mode = None, [], 0, adapter.mode
    for candidate in fallback_chain(adapter, settings().demo_enabled):
        # A prepared answer only applies to the exact data it was written for: all or nothing.
        strict = candidate.mode == "fixture"
        try:
            events, found, lost = verify(candidate.propose(payload), sources, strict)
        except Exception:
            continue
        if strict and lost:
            continue
        proposed, items, dropped, mode = events, found, lost, candidate.mode
        if proposed or not sources:
            break
    if dropped:
        warnings.append(f"Se descartaron {dropped} propuesta(s) sin fuente verificable.")
    if proposed is None:
        raise HTTPException(503, "No pudimos organizar la cronología. Tus relatos y revisiones siguen guardados. Intenta nuevamente")
    preserved = [deepcopy(event) for event in row.events if event['reviewed']] if row else []
    known = {source['id'] for event in preserved for source in event_sources(event)}
    for proposal in proposed:
        if known & {source['id'] for source in proposal['sources']}:
            continue
        original = {key: proposal[key] for key in ('description', 'date_kind', 'event_date', 'approximate_date')}
        preserved.append({"id": str(uuid4()), "source": proposal['sources'][0], "sources": proposal['sources'],
                          "support_quotes": proposal['support_quotes'], "original": original, **original,
                          "status": "proposed", "reviewed": False, "edited": False, "needs_review": True, "mode": mode})
    if mode == "extractive" and len(sources) > len(proposed):
        warnings.append("La propuesta es una selección de fragmentos, no una reconstrucción completa. Revisa las fuentes.")
    linked = {source['source_id'] for event in preserved if event['status'] != 'discarded'
              for source in event_sources(event) if source['kind'] == 'file'}
    items += [review_item("unlinked_evidence", f"{file.filename} todavía no está asociado a ningún evento.", file_id=file.id)
              for file in files if file.id not in linked]
    previous = {item['id']: item['status'] for item in (row.review_items or [])} if row else {}
    items = [{**item, "status": previous.get(item['id'], "open")} for item in {item['id']: item for item in items}.values()]
    now = datetime.now(timezone.utc)
    if row is None:
        row = Timeline(record_id=str(record_id), revision=0, mode=mode, events=[], warnings=[], review_items=[], processed_at=now)
        db.add(row)
    row.events, row.warnings, row.review_items, row.mode, row.processed_at = preserved, warnings, items, mode, now
    row.revision += 1
    row.confirmed_revision = None
    db.commit()
    return state(row, adapter.mode)


@router.put("/review-items/{item_id}")
def review_item_status(record_id: UUID, item_id: str, data: ItemReview, user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    row = lock(db, record_id, user, data.revision)
    items = deepcopy(row.review_items or []) if row else []
    item = next((value for value in items if value['id'] == item_id), None)
    if item is None:
        raise HTTPException(404, "Aviso no encontrado")
    # Atender un aviso no altera eventos: no cambia la versión ni la confirmación de la cronología.
    item['status'] = data.status
    row.review_items = items
    db.commit()
    return state(row, row.mode)


@router.put("/events/{event_id}")
def review(record_id: UUID, event_id: UUID, data: Review, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = lock(db, record_id, user, data.revision)
    events = deepcopy(row.events) if row else []
    event = next((item for item in events if item['id'] == str(event_id)), None)
    if event is None:
        raise HTTPException(404, "Evento no encontrado")
    content = data.model_dump(mode='json', include={'description', 'date_kind', 'event_date', 'approximate_date'})
    event.update(content)
    event.update(status=data.status, reviewed=True, edited=content != event['original'])
    row.events = events
    row.revision += 1
    row.confirmed_revision = None
    db.commit()
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


@router.get("/events/{event_id}/source")
def source(record_id: UUID, event_id: UUID, source: str | None = None, user: User = Depends(current_user),
           db: Session = Depends(get_db)):
    owned_record(db, record_id, user)
    row = db.get(Timeline, str(record_id))
    event = next((e for e in row.events if e['id'] == str(event_id)), None) if row else None
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    ref = next((item for item in event_sources(event) if source is None or item['id'] == source), None)
    if ref is None:
        raise HTTPException(404, "Fuente no encontrada")
    if ref['kind'] == 'file' and ref.get('field') == 'description':
        current = owned_file(db, record_id, ref['source_id'], user)
        text, version = current.description, description_version(current.description)
    elif ref['kind'] == 'file':
        current = owned_file(db, record_id, ref['source_id'], user)
        text, version = None, current.sha256
    elif ref['kind'] == 'account':
        current = owned_account(db, record_id, ref['source_id'], user)
        text, version = current.description, current.updated_at.isoformat()
    else:
        current = owned_record(db, record_id, user)
        text, version = current.description, current.updated_at.isoformat()
    return {**ref, "current_text": text, "changed": version != ref['version']}
