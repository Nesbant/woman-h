"""Checks what an AI provider proposes against the collected fragments. Nothing unsupported is ever stored."""
from datetime import date
from hashlib import sha256
import re
from .sources import unknown_date
from .timeline_ai import fallback_chain

# Guardrail: proposals never score, judge credibility, attribute intent or suggest sanctions (SPEC §15).
FORBIDDEN = re.compile(r"probabilidad|culpab|credib|cre[ií]ble|sanci[oó]n|despid|intenci[oó]n sexual", re.I)
MAX_EVENTS = 12
MAX_REVIEW_ITEMS = 10
REVIEW_KINDS = ("date_inconsistency", "possible_relation")
CLOCK = re.compile(r"[0-2]\d:[0-5]\d")
CONTENT = ('title', 'description', 'date_kind', 'event_date', 'approximate_date', 'event_time')


def clean_text(value, limit):
    """A stripped string within limits and free of judgement language, or None."""
    if type(value) is not str or not 0 < len(value.strip()) <= limit or FORBIDDEN.search(value):
        return None
    return value.strip()


def short_title(text):
    text = " ".join(text.split())
    return text if len(text) <= 80 else text[:79].rstrip() + "…"


def squash(text):
    return " ".join(text.split()).casefold()


def cite(item, sources):
    """Source IDs that exist and quotes that appear literally in some fragment.
    Returns the cited sources, the verified quotes and how many quotes could not be verified."""
    by_id = {s['id']: s for s in sources}
    ids = [key for key in item.get('source_ids') or [] if type(key) is str and key in by_id]
    quotes, missing = [], 0
    for quote in item.get('support_quotes') or []:
        hits = [s['id'] for s in sources if type(quote) is str and quote.strip() and len(quote) <= 2000
                and squash(quote) in squash(s['quote'])]
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


def exact_date(value, cited):
    """An exact date survives only when a cited fragment states it; otherwise it stays pending."""
    try:
        day = date.fromisoformat(value)
    except ValueError:
        return unknown_date()
    written = (day.isoformat(), day.strftime("%d/%m/%Y"))
    if any(s['date'].get('event_date') == day.isoformat() or any(w in s['quote'] for w in written) for s in cited):
        return {"date_kind": "exact", "event_date": day.isoformat(), "approximate_date": None}
    return unknown_date()


def checked_date(item, cited):
    kind = item.get('date_kind')
    if kind is None:
        return dict(cited[0]['date'])
    if kind == 'exact' and type(item.get('event_date')) is str:
        return exact_date(item['event_date'], cited)
    approx = clean_text(item.get('approximate_date'), 200)
    if kind == 'approximate' and approx:
        return {"date_kind": "approximate", "event_date": None, "approximate_date": approx}
    return unknown_date()


def checked_time(item, cited):
    """A clock time is kept only when it is written in a cited fragment."""
    value = item.get('event_time')
    if type(value) is str and CLOCK.fullmatch(value) and any(value in s['quote'] for s in cited):
        return value
    return None


def verify_event(raw, sources, strict):
    """A verified event, or None when it cannot be traced to the sources."""
    if not isinstance(raw, dict):
        return None
    cited, quotes, missing = cite(raw, sources)
    description = clean_text(raw.get('description'), 2000)
    if not cited or (strict and missing) or not description:
        return None
    dates = checked_date(raw, cited)
    return {"title": clean_text(raw.get('title'), 200) or short_title(description), "description": description, **dates,
            "event_time": checked_time(raw, cited) if dates['date_kind'] == 'exact' else None,
            "sources": cited, "support_quotes": quotes}


def review_item(kind, message, source_ids=(), file_id=None):
    key = sha256(f"{kind}:{','.join(sorted(source_ids))}:{file_id}".encode()).hexdigest()[:32]
    return {"id": key, "kind": kind, "message": message, "source_ids": list(source_ids),
            "file_id": file_id, "status": "open", "event_ids": [], "action_label": None, "resolution_note": None}


def verify_review_item(raw, sources, strict):
    """(item or None, dropped): a notice must cite sources; in strict mode every quote must verify."""
    if not isinstance(raw, dict) or raw.get('kind') not in REVIEW_KINDS:
        return None, False
    cited, _, missing = cite(raw, sources)
    if strict and missing:
        return None, True
    message = clean_text(raw.get('message'), 500)
    if not cited or not message:
        return None, False
    label = raw.get('action_label')
    return {**review_item(raw['kind'], message, [s['id'] for s in cited]),
            "action_label": label.strip() if type(label) is str and 0 < len(label.strip()) <= 40 else None,
            "resolution_note": clean_text(raw.get('resolution_note'), 200)}, False


def verify(proposal, sources, strict=False):
    """strict: every quote must be verified, otherwise the item is dropped (used for prepared answers)."""
    if not isinstance(proposal, dict):
        raise ValueError("Propuesta inválida")
    raw_events = (proposal.get('events') or [])[:MAX_EVENTS]
    events = [event for event in (verify_event(raw, sources, strict) for raw in raw_events) if event]
    dropped = len(raw_events) - len(events)
    items = []
    for raw in (proposal.get('review_items') or [])[:MAX_REVIEW_ITEMS]:
        item, lost = verify_review_item(raw, sources, strict)
        dropped += lost
        if item:
            items.append(item)
    return events, items, dropped


def propose(adapter, sources, demo):
    """Runs the fallback chain. Returns (events, items, dropped, mode), or None when every adapter failed."""
    payload = [{"id": s['id'], "text": s['quote']} for s in sources]
    result = None
    for candidate in fallback_chain(adapter, demo):
        # A prepared answer only applies to the exact data it was written for: all or nothing.
        strict = candidate.mode == "fixture"
        try:
            events, items, dropped = verify(candidate.propose(payload), sources, strict)
        except Exception:
            continue
        if strict and dropped:
            continue
        result = (events, items, dropped, candidate.mode)
        if events or not sources:
            break
    return result
