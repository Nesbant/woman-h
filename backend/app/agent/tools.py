"""EST-03 (issue #9): the six agent tools as validated, testable-without-an-LLM functions over the private
case. Every tool call is one state change proposed by the (real or scripted) brain, executed here exactly
like an HTTP handler would: validated against the DB, source-cited like everywhere else in the app
(`proposals.py`), and reported back `tool_result`-shaped — `is_error` and a message the brain can read, never
a raised exception the caller must special-case.

Non-negotiable (epic #5): confirming or discarding a fact requires a literal `user_quote` copied from the
message the person actually sent this turn (`_require_quote`); `model_inference` never confirms itself —
enforced structurally, since every path that sets `status='accepted'` here also sets `reviewed=True` at the
same time (the same guarantee `events.ModelInferenceNotReviewed` defends). No tool here ever creates or
touches an `InstitutionalCase`: `prepare_share_preview` (EST-06, issue #12) refreshes the private
`ComplaintDraft` the same way `POST .../complaint/generate` does (`drafts.refresh_draft`, built on
`draft_fields.build_fields`) and returns only the `open_share_preview` action — never a send, never an
institutional record.

A tool call never commits: it only mutates `ToolContext.row.events` (and, for the share preview,
`ComplaintDraft` fields, through the same session the turn orchestrator commits once at the end of the
turn). The turn orchestrator (EST-04, `turn.py`) commits once per turn, after every tool call in that turn's
loop succeeded — the same per-case lock that serializes turns is what makes a client-supplied revision
unnecessary here, unlike the plain HTTP timeline endpoints."""
from dataclasses import dataclass, field
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..drafts import find_draft, refresh_draft
from ..models import PrivateRecord, RecordFile, Timeline, User
from ..proposals import checked_time, clean_text, exact_date
from ..sources import literal_date, unknown_date
from .events import quote_in_message, new_message_event, update_message_event
from .state import build_case_state

ORIGINS = ("user_statement", "model_inference")
DATE_KINDS = ("exact", "approximate", "unknown")


class ToolError(Exception):
    """A tool call could not be validated; caught by `execute` and reported as `is_error`, never raised past it."""


@dataclass
class ToolContext:
    """What every tool needs about the current turn: the DB, the already-locked `Timeline` row for this case
    (created empty when the conversation started, see `conversation.py::start_conversation`), and the message
    whose literal text every `user_quote` is checked against. `touched_event_ids` accumulates across every
    tool call in one turn, for the turn orchestrator to report on `ChatTurnResponse.touched_event_ids`."""
    db: Session
    record_id: str
    row: Timeline
    message_id: str
    message_text: str
    touched_event_ids: list = field(default_factory=list)


@dataclass
class ToolResult:
    content: dict
    is_error: bool = False


# --- shared helpers ---------------------------------------------------------------------------------------

def _find_event(ctx, event_id):
    event = next((item for item in ctx.row.events if item["id"] == event_id), None)
    if event is None:
        raise ToolError(f"No existe un hecho con id {event_id!r} en este caso.")
    return event


def _replace_event(ctx, updated):
    ctx.row.events = [updated if item["id"] == updated["id"] else item for item in ctx.row.events]


def _touch(ctx, event_id):
    """Every tool that changes event content or status bumps the timeline revision, exactly like the plain
    HTTP endpoints do (`timeline.bump`) — a draft built on the old revision becomes stale either way."""
    ctx.row.revision += 1
    ctx.row.confirmed_revision = None
    if event_id not in ctx.touched_event_ids:
        ctx.touched_event_ids.append(event_id)


def _require_quote(ctx, quote):
    if not quote_in_message(quote, ctx.message_text):
        raise ToolError("Esa cita no aparece tal cual en tu último mensaje. Copia una frase que realmente escribiste.")


def _quote_fragment(ctx, quote):
    """A single-fragment 'source', shaped like `sources.py`'s, so `exact_date`/`checked_time` can verify a
    date or time exactly like they verify one for the propose pipeline: only when it is written in the quote
    itself, never invented from what the tool call merely claims."""
    return {"id": f"message:{ctx.message_id}", "kind": "message", "source_id": ctx.message_id,
            "label": "Tu mensaje en el chat", "quote": quote, "date": literal_date(quote)}


def _checked_new_date(date_kind, event_date, approximate_date, fragment):
    if date_kind == "exact" and isinstance(event_date, str):
        return exact_date(event_date, [fragment])
    if date_kind == "approximate":
        approx = clean_text(approximate_date, 200)
        return {"date_kind": "approximate", "event_date": None, "approximate_date": approx} if approx else unknown_date()
    return unknown_date()


def _sources_of(event):
    return event.get("sources") or [event["source"]]


# --- create_or_update_candidate_event ----------------------------------------------------------------------

CREATE_OR_UPDATE_SCHEMA = {
    "name": "create_or_update_candidate_event",
    "description": ("Crea un hecho candidato a partir de lo que la persona contó en el chat, o actualiza uno "
                    "que todavía no fue revisado (status 'proposed', creado por esta misma herramienta). "
                    "Nunca confirma ni descarta nada por sí sola."),
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {"type": ["string", "null"],
                        "description": "Id del candidato a actualizar, o null para crear uno nuevo."},
            "title": {"type": "string", "maxLength": 200, "description": "Título breve del hecho."},
            "description": {"type": "string", "maxLength": 2000, "description": "Lo que la persona contó."},
            "date_kind": {"type": "string", "enum": list(DATE_KINDS)},
            "event_date": {"type": ["string", "null"], "description": "AAAA-MM-DD; solo si date_kind es 'exact'."},
            "approximate_date": {"type": ["string", "null"], "description": "Solo si date_kind es 'approximate'."},
            "event_time": {"type": ["string", "null"],
                          "description": "HH:MM; se conserva solo si aparece escrita tal cual en user_quote."},
            "origin": {"type": "string", "enum": list(ORIGINS),
                      "description": "'user_statement' si la persona lo dijo directamente; 'model_inference' "
                                    "si es un patrón que notaste vos, no algo que ella haya afirmado."},
            "user_quote": {"type": "string", "maxLength": 2000,
                          "description": "Cita literal del último mensaje de la persona que respalda este hecho."},
        },
        "required": ["event_id", "title", "description", "date_kind", "event_date", "approximate_date",
                    "event_time", "origin", "user_quote"],
        "additionalProperties": False,
    },
    "strict": True,
}


def create_or_update_candidate_event(arguments, ctx):
    quote = arguments["user_quote"]
    _require_quote(ctx, quote)
    title = clean_text(arguments["title"], 200)
    description = clean_text(arguments["description"], 2000)
    if not title or not description:
        raise ToolError("El título o la descripción están vacíos, o usan lenguaje que VERA no puede registrar.")
    if arguments["date_kind"] not in DATE_KINDS:
        raise ToolError("date_kind inválido.")
    if arguments["origin"] not in ORIGINS:
        raise ToolError("origin inválido.")
    fragment = _quote_fragment(ctx, quote)
    dates = _checked_new_date(arguments["date_kind"], arguments["event_date"], arguments["approximate_date"], fragment)
    event_time = checked_time({"event_time": arguments["event_time"]}, [fragment]) if dates["date_kind"] == "exact" else None

    event_id = arguments["event_id"]
    if event_id is None:
        event = new_message_event(ctx.message_id, ctx.message_text, quote, title, description, dates["date_kind"],
                                  dates["event_date"], dates["approximate_date"], event_time, arguments["origin"])
        ctx.row.events = [*ctx.row.events, event]
    else:
        existing = _find_event(ctx, event_id)
        if existing.get("mode") != "message":
            raise ToolError("Esta herramienta solo administra hechos creados desde la conversación.")
        if existing["status"] != "proposed":
            raise ToolError("Ese hecho ya fue revisado; usa confirm_event, discard_event o la cronología para cambiarlo.")
        event = update_message_event(existing, ctx.message_id, ctx.message_text, quote, title, description,
                                     dates["date_kind"], dates["event_date"], dates["approximate_date"],
                                     event_time, arguments["origin"])
        _replace_event(ctx, event)
    _touch(ctx, event["id"])
    return {"event_id": event["id"], "status": "candidate"}


# --- confirm_event ------------------------------------------------------------------------------------------

CONFIRM_EVENT_SCHEMA = {
    "name": "confirm_event",
    "description": ("Confirma un hecho candidato porque la persona pidió explícitamente guardarlo. Exige la "
                    "frase literal de su último mensaje donde lo pidió; nunca se confirma sin ese pedido "
                    "explícito, ni siquiera un hecho que vos misma propusiste (model_inference)."),
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "Id del hecho candidato a confirmar."},
            "user_quote": {"type": "string", "maxLength": 2000,
                          "description": "Frase literal del último mensaje donde la persona pidió guardarlo."},
        },
        "required": ["event_id", "user_quote"],
        "additionalProperties": False,
    },
    "strict": True,
}


def confirm_event(arguments, ctx):
    _require_quote(ctx, arguments["user_quote"])
    event = _find_event(ctx, arguments["event_id"])
    if event["status"] != "proposed":
        raise ToolError("Ese hecho ya no está pendiente de confirmación.")
    quotes = list(dict.fromkeys([*(event.get("support_quotes") or []), arguments["user_quote"]]))
    updated = {**event, "status": "accepted", "reviewed": True, "support_quotes": quotes}
    _replace_event(ctx, updated)
    _touch(ctx, event["id"])
    return {"event_id": event["id"], "status": "confirmed"}


# --- discard_event ------------------------------------------------------------------------------------------

DISCARD_EVENT_SCHEMA = {
    "name": "discard_event",
    "description": ("Descarta un hecho candidato porque la persona pidió explícitamente no incluirlo. Exige la "
                    "frase literal de su último mensaje donde lo pidió; el hecho queda en el historial como "
                    "descartado, nunca se elimina."),
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "Id del hecho candidato a descartar."},
            "user_quote": {"type": "string", "maxLength": 2000,
                          "description": "Frase literal del último mensaje donde la persona pidió descartarlo."},
        },
        "required": ["event_id", "user_quote"],
        "additionalProperties": False,
    },
    "strict": True,
}


def discard_event(arguments, ctx):
    _require_quote(ctx, arguments["user_quote"])
    event = _find_event(ctx, arguments["event_id"])
    if event["status"] == "discarded":
        raise ToolError("Ese hecho ya estaba descartado.")
    updated = {**event, "status": "discarded", "reviewed": True}
    _replace_event(ctx, updated)
    _touch(ctx, event["id"])
    return {"event_id": event["id"], "status": "discarded"}


# --- attach_evidence ----------------------------------------------------------------------------------------

ATTACH_EVIDENCE_SCHEMA = {
    "name": "attach_evidence",
    "description": "Vincula un archivo ya subido a este caso con un hecho de la cronología.",
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "Id del hecho al que se vincula el archivo."},
            "file_id": {"type": "string", "description": "Id del archivo, ya subido a este mismo caso."},
        },
        "required": ["event_id", "file_id"],
        "additionalProperties": False,
    },
    "strict": True,
}


def attach_evidence(arguments, ctx):
    event = _find_event(ctx, arguments["event_id"])
    file = ctx.db.scalar(select(RecordFile).where(RecordFile.id == arguments["file_id"],
                                                  RecordFile.record_id == ctx.record_id))
    if file is None:
        raise ToolError("Ese archivo no pertenece a este caso.")
    sources = _sources_of(event)
    if any(source["kind"] == "file" and source["source_id"] == file.id for source in sources):
        return {"event_id": event["id"], "file_id": file.id, "status": "already_linked"}
    new_source = {"id": f"file:{file.id}:chat:{event['id']}", "kind": "file", "source_id": file.id,
                 "label": file.filename, "quote": file.description or f"Evidencia adjunta: {file.filename}",
                 "page": None, "version": file.sha256, "field": None, "date": unknown_date()}
    updated = {**event, "sources": [*sources, new_source]}
    _replace_event(ctx, updated)
    _touch(ctx, event["id"])
    return {"event_id": event["id"], "file_id": file.id, "status": "linked"}


# --- get_case_summary ---------------------------------------------------------------------------------------

GET_CASE_SUMMARY_SCHEMA = {
    "name": "get_case_summary",
    "description": "Devuelve el estado actual del caso: hechos, personas, conteos, evidencia y qué falta.",
    "input_schema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    "strict": True,
}


def get_case_summary(arguments, ctx):
    return build_case_state(ctx.db, ctx.record_id).model_dump(mode="json")


# --- prepare_share_preview -------------------------------------------------------------------------------
# EST-06 (issue #12): reuses `drafts.refresh_draft` (itself built on `draft_fields.build_fields`) to refresh
# the actual private draft — the same one `POST .../complaint/generate` maintains — then reads the default
# selection straight out of it: every accepted fact plus the files its sources already link (the same rule
# the teammate's `useShareSelection` frontend hook defaults to: every draft fact and its linked files). This
# is why relato, the private note and unlinked files are excluded — none of them are draft fields at all.
# Never submits: no `InstitutionalCase` is created or touched by anything in this module.

PREPARE_SHARE_PREVIEW_SCHEMA = {
    "name": "prepare_share_preview",
    "description": ("Prepara una vista previa de lo que se compartiría si la persona decidiera enviarlo más "
                    "adelante. Nunca envía ni crea un caso institucional: eso siempre requiere una acción "
                    "explícita y por separado de la persona, fuera de esta herramienta."),
    "input_schema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    "strict": True,
}


def _case_owner(ctx):
    record = ctx.db.get(PrivateRecord, ctx.record_id)
    return ctx.db.get(User, record.owner_id)


def prepare_share_preview(arguments, ctx):
    user = _case_owner(ctx)
    draft = refresh_draft(ctx.db, ctx.record_id, user, ctx.row, find_draft(ctx.db, ctx.record_id))
    event_ids = [fact["event_id"] for fact in draft.fields_json["facts"]["events"]]
    file_ids = draft.fields_json["evidence"]["file_ids"]
    return {"action": "open_share_preview", "event_ids": event_ids, "file_ids": file_ids}


# --- registry and executor -----------------------------------------------------------------------------------

TOOLS = {
    "create_or_update_candidate_event": (CREATE_OR_UPDATE_SCHEMA, create_or_update_candidate_event),
    "confirm_event": (CONFIRM_EVENT_SCHEMA, confirm_event),
    "discard_event": (DISCARD_EVENT_SCHEMA, discard_event),
    "attach_evidence": (ATTACH_EVIDENCE_SCHEMA, attach_evidence),
    "get_case_summary": (GET_CASE_SUMMARY_SCHEMA, get_case_summary),
    "prepare_share_preview": (PREPARE_SHARE_PREVIEW_SCHEMA, prepare_share_preview),
}

TOOL_SCHEMAS = [schema for schema, _ in TOOLS.values()]


def execute(name, arguments, ctx) -> ToolResult:
    """Runs one tool call and always returns a `ToolResult`, never raises: an unknown tool name or a failed
    validation both become `is_error=True` with a message meant for the brain to read, matching the epic's
    `tool_result`/`is_error` contract."""
    entry = TOOLS.get(name)
    if entry is None:
        return ToolResult({"message": f"Herramienta desconocida: {name}"}, is_error=True)
    _, handler = entry
    try:
        return ToolResult(handler(arguments, ctx))
    except ToolError as error:
        return ToolResult({"message": str(error)}, is_error=True)
