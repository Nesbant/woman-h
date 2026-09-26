"""EST-05 (issue #11): `ClaudeBrain`, the real `AgentBrain` (`agent/brain.py`) over the Anthropic API — same
per-round shape as `ScriptedBrain` (`next_step(ctx: RoundContext) -> BrainStep`, called once per round by
`agent/turn.py`), but each call is a single, self-contained, stateless request: it rebuilds the whole
conversation from `RoundContext` every time, including a synthetic reconstruction of this turn's own
`round_results` as tool_use/tool_result exchanges. Real tool-call ids are never available across separate
`next_step` calls anyway (the SDK does not expose a resumable request), and none are needed: only *this*
request's own bytes have to stay internally consistent, so `round-{i}` placeholder ids are enough.

Prompt caching (epic #5: "prompt caching sobre tools + system"): `tools` render before `system` on the wire,
so one `cache_control` breakpoint on `SYSTEM_PROMPT`'s block caches both together — as long as neither ever
changes, which is why the case state, the conversation history and this message's attachment ids all go in
`messages` instead (`agent/prompt.py` carries the full argument). `system`, `tools` and `model` never vary
per case or per turn, so the same cache entry serves every case from the second call on.

Any typed SDK error, a missing API key, a `refusal`/`max_tokens` stop, unparseable structured output, or a
reply that fails the judgment-language guardrail (`proposals.FORBIDDEN`, SPEC §15) all raise `BrainError` —
caught once per turn by `agent/turn.py`, which reruns the whole turn with a fresh `ScriptedBrain` instead of
ever emitting a 5xx or leaving a half-written turn."""
import json
import anthropic
from ..proposals import FORBIDDEN
from .brain import BrainStep, RoundContext, ToolCall
from .contracts import SuggestedAction
from .prompt import SYSTEM_PROMPT
from .tools import TOOL_SCHEMAS

MAX_REPLY_TOKENS = 4096

# The final reply's structure (`output_config.format`): a short reply for the person, plus optional buttons
# the UI can offer — never something the brain itself acts on. Mirrors `contracts.SuggestedAction` exactly,
# so the parsed dict below always builds one without extra validation.
FINAL_REPLY_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "reply_text": {"type": "string", "maxLength": 2000},
            "suggested_actions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "enum": ["open_share_preview", "review_timeline",
                                                            "attach_evidence", "confirm_event", "open_draft"]},
                        "label": {"type": "string", "maxLength": 120},
                        "event_ids": {"type": "array", "items": {"type": "string"}},
                        "file_ids": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["type", "label", "event_ids", "file_ids"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["reply_text", "suggested_actions"],
        "additionalProperties": False,
    },
}


class BrainError(Exception):
    """`ClaudeBrain` could not produce a step this round: a typed SDK error, a missing key, a `refusal` or
    `max_tokens` stop, malformed structured output, or a reply that failed the judgment-language guardrail.
    Caught once per turn by `agent/turn.py`, which reruns the whole turn with a fresh `ScriptedBrain`."""


def _history_messages(recent_messages):
    """Every message before the current turn's own, verbatim. `agent/turn.py` always includes the just-
    saved user message as the last entry of `recent_messages` — handled separately by `_current_message`,
    which augments it with the fresh case state instead of sending it as plain text."""
    return [{"role": message.role, "content": message.text} for message in recent_messages[:-1]]


def _current_message(ctx: RoundContext):
    """The current turn's own message: the person's literal text, plus a second block carrying the case
    state VERA is meant to read (never written by the person) — this is what the epic means by "el estado
    del caso va en el mensaje del turno": never in `system`, which must stay byte-identical to keep caching
    it works."""
    envelope = {"case_state": ctx.case_state.model_dump(mode="json"), "attachment_ids": ctx.attachment_ids}
    return {"role": "user", "content": [
        {"type": "text", "text": ctx.user_text},
        {"type": "text", "text": "[Estado del caso derivado por el sistema, no escrito por la persona]\n"
                                 + json.dumps(envelope, ensure_ascii=False, sort_keys=True)},
    ]}


def _round_messages(round_results):
    """This turn's already-executed tool calls, reconstructed as one assistant/user exchange per round. The
    `round-{i}` id only needs to be unique and consistent *within this one outgoing request* — nothing
    outside it is ever read back, since every `next_step` call rebuilds the conversation from scratch."""
    messages = []
    for index, result in enumerate(round_results):
        tool_use_id = f"round-{index}"
        messages.append({"role": "assistant", "content": [
            {"type": "tool_use", "id": tool_use_id, "name": result.name, "input": result.arguments}]})
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": tool_use_id,
             "content": json.dumps(result.content, ensure_ascii=False), "is_error": result.is_error}]})
    return messages


def _messages(ctx: RoundContext):
    return [*_history_messages(ctx.recent_messages), _current_message(ctx), *_round_messages(ctx.round_results)]


def _judged(text):
    """SPEC §15's guardrail (`proposals.FORBIDDEN`), applied to whatever Claude wants to say to the person —
    never let a provider's judgment-language slip past a tool call's own validation into a plain reply."""
    if not text or FORBIDDEN.search(text):
        raise BrainError("La respuesta del proveedor usó lenguaje de juicio que VERA nunca dice; se descarta.")
    return text


def _final_step(text: str) -> BrainStep:
    try:
        data = json.loads(text)
        reply_text = _judged(data["reply_text"])
        actions = [SuggestedAction(type=item["type"], label=_judged(item.get("label")),
                                   event_ids=item.get("event_ids") or [], file_ids=item.get("file_ids") or [])
                  for item in data.get("suggested_actions") or []]
    except BrainError:
        raise
    except Exception as error:  # malformed JSON, a missing key, an invalid enum value, ...
        raise BrainError(f"Salida estructurada inválida: {error}") from error
    return BrainStep(tool_call=None, reply_text=reply_text, suggested_actions=actions)


def _tool_step(response) -> BrainStep:
    call = next((block for block in response.content if block.type == "tool_use"), None)
    if call is None:
        raise BrainError("El proveedor marcó stop_reason='tool_use' sin incluir ninguna llamada.")
    return BrainStep(tool_call=ToolCall(name=call.name, arguments=call.input))


class ClaudeBrain:
    """`CHAT_BRAIN=claude`: one Anthropic API call per round (see the module docstring for why it needs no
    state of its own between rounds beyond memoizing the client)."""
    mode = "ai"

    def __init__(self):
        self._client = None

    def _client_or_none(self):
        from ..config import settings
        if self._client is None:
            key = settings().anthropic_api_key
            if not key:
                return None
            self._client = anthropic.Anthropic(api_key=key)
        return self._client

    def next_step(self, ctx: RoundContext) -> BrainStep:
        from ..config import settings
        client = self._client_or_none()
        if client is None:
            raise BrainError("Falta ANTHROPIC_API_KEY; no se puede llamar al proveedor.")
        try:
            response = client.messages.create(
                model=settings().chat_model,
                max_tokens=MAX_REPLY_TOKENS,
                system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
                tools=TOOL_SCHEMAS,
                output_config={"format": FINAL_REPLY_FORMAT, "effort": settings().chat_effort},
                messages=_messages(ctx),
            )
        except anthropic.APIError as error:
            raise BrainError(f"Error del proveedor: {error}") from error
        if response.stop_reason == "refusal":
            category = getattr(response.stop_details, "category", None)
            raise BrainError(f"El proveedor rechazó la solicitud (categoría: {category!r}).")
        if response.stop_reason == "max_tokens":
            raise BrainError("La respuesta del proveedor se truncó por max_tokens.")
        if response.stop_reason == "tool_use":
            return _tool_step(response)
        text = next((block.text for block in response.content if block.type == "text"), None)
        if text is None:
            raise BrainError(f"stop_reason inesperado sin bloque de texto: {response.stop_reason!r}")
        return _final_step(text)
