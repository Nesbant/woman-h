"""EST-05 (issue #11, revised 2026-09-26): `OpenRouterBrain`, the real `AgentBrain` (`agent/brain.py`) over
OpenRouter's OpenAI-compatible Chat Completions API (`POST /api/v1/chat/completions`, Bearer
`OPENROUTER_API_KEY`) — replaces the earlier Anthropic-backed `ClaudeBrain` (user decision, 2026-09-26:
"OpenRouter replaces Anthropic"). Same per-round shape as `ScriptedBrain` (`next_step(ctx: RoundContext) ->
BrainStep`, called once per round by `agent/turn.py`), but each call is a single, self-contained, stateless
request: it rebuilds the whole conversation from `RoundContext` every time, including a synthetic
reconstruction of this turn's own `round_results` as assistant `tool_calls`/`tool` message exchanges. Real
tool-call ids are never available across separate `next_step` calls anyway (nothing outside one outgoing
request ever reads them back), so `round-{i}` placeholder ids are enough, exactly like the previous brain.

Model + fallback (`config.py`): `chat_model` (primary) and `chat_fallback_models` are sent together as
OpenRouter's own `models` array (`[primary, *fallbacks]`), so OpenRouter itself retries the next model if the
first one's provider is unavailable, mid-outage, or rate-limited — one HTTP round-trip either way, no local
retry loop. `provider.require_parameters: true` restricts routing to providers that actually support both
`tools` and `structured_outputs` for the requested model (never silently drop the tool schema or the
response_format to a provider that cannot honor them). `provider.sort: "throughput"` additionally biases
routing toward the fastest available provider for the selected model: this is a chat UI waiting on a reply,
where turnaround time matters more than shaving fractions of a cent by sorting on price instead — the model
choice itself already controls cost.

No explicit prompt-caching directive (Anthropic's `cache_control` had no equivalent to carry over): OpenAI-
compatible providers that cache repeated prompt prefixes (several of the ones behind OpenRouter do) apply it
automatically to any request with a stable prefix, which is still true here (`system` + `tools` never change
between requests, turns or cases; only the per-turn message and this turn's own round messages do) — there is
just no request field to turn it on or read `cache_read_input_tokens` back from generically across providers.

Any HTTP error, timeout, missing key, a `finish_reason` of `length` or `content_filter`, a refusal, malformed
JSON, or a schema mismatch all raise `BrainError` — caught once per turn by `agent/turn.py`, which reruns the
whole turn with a fresh `ScriptedBrain` instead of ever emitting a 5xx or leaving a half-written turn."""
import json
import httpx
from ..proposals import FORBIDDEN
from .brain import BrainStep, RoundContext, ToolCall
from .contracts import SuggestedAction
from .prompt import SYSTEM_PROMPT
from .tools import TOOL_SCHEMAS

MAX_REPLY_TOKENS = 4096

# The final reply's structure (`response_format`): a short reply for the person, plus optional buttons the UI
# can offer — never something the brain itself acts on. Mirrors `contracts.SuggestedAction` exactly, so the
# parsed dict below always builds one without extra validation. Same shape the previous Anthropic brain used.
FINAL_REPLY_SCHEMA = {
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
}


class BrainError(Exception):
    """`OpenRouterBrain` could not produce a step this round: an HTTP/timeout error, a missing key, a
    `length`/`content_filter` finish reason, a refusal, malformed structured output, or a reply that failed
    the judgment-language guardrail. Caught once per turn by `agent/turn.py`, which reruns the whole turn with
    a fresh `ScriptedBrain`."""


def _tool_definitions():
    """`agent/tools.py::TOOL_SCHEMAS` (Anthropic-shaped: `name`/`description`/`input_schema`/`strict`)
    converted to OpenAI-compatible function-tool definitions, `strict: true` preserved so the provider
    validates arguments against the exact same schema `tools.py`'s executor already enforces server-side."""
    return [{"type": "function", "function": {"name": schema["name"], "description": schema["description"],
                                              "parameters": schema["input_schema"], "strict": True}}
           for schema in TOOL_SCHEMAS]


def _history_messages(recent_messages):
    """Every message before the current turn's own, verbatim. `agent/turn.py` always includes the just-
    saved user message as the last entry of `recent_messages` — handled separately by `_current_message`,
    which augments it with the fresh case state instead of sending it as plain text."""
    return [{"role": message.role, "content": message.text} for message in recent_messages[:-1]]


def _current_message(ctx: RoundContext):
    """The current turn's own message: the person's literal text, plus the case state VERA is meant to read
    (never written by the person) — this is what the epic means by "el estado del caso va en el mensaje del
    turno": never in `system`, which must stay byte-identical for any provider-side prompt caching to work."""
    envelope = {"case_state": ctx.case_state.model_dump(mode="json"), "attachment_ids": ctx.attachment_ids}
    marker = "[Estado del caso derivado por el sistema, no escrito por la persona]"
    return {"role": "user", "content": f"{ctx.user_text}\n\n{marker}\n"
                                       + json.dumps(envelope, ensure_ascii=False, sort_keys=True)}


def _round_messages(round_results):
    """This turn's already-executed tool calls, reconstructed as one assistant/tool exchange per round (the
    OpenAI-compatible shape: an assistant message carrying `tool_calls`, followed by one `role: "tool"`
    message per call, matched by `tool_call_id`). The `round-{i}` id only needs to be unique and consistent
    *within this one outgoing request* — nothing outside it is ever read back, since every `next_step` call
    rebuilds the conversation from scratch."""
    messages = []
    for index, result in enumerate(round_results):
        call_id = f"round-{index}"
        messages.append({"role": "assistant", "content": None, "tool_calls": [
            {"id": call_id, "type": "function",
             "function": {"name": result.name, "arguments": json.dumps(result.arguments, ensure_ascii=False)}}]})
        messages.append({"role": "tool", "tool_call_id": call_id,
                         "content": json.dumps({"is_error": result.is_error, "content": result.content},
                                               ensure_ascii=False)})
    return messages


def _messages(ctx: RoundContext):
    return [{"role": "system", "content": SYSTEM_PROMPT}, *_history_messages(ctx.recent_messages),
           _current_message(ctx), *_round_messages(ctx.round_results)]


def _request_body(ctx: RoundContext, config):
    return {
        "model": config.chat_model,
        "models": [config.chat_model, *config.chat_fallback_models],
        "messages": _messages(ctx),
        "tools": _tool_definitions(),
        "tool_choice": "auto",
        # At most one tool call per round (`BrainStep.tool_call` is singular, not a list) — the orchestrator's
        # own `MAX_ROUNDS` loop, not the provider, is what runs several tools across a turn.
        "parallel_tool_calls": False,
        "max_tokens": MAX_REPLY_TOKENS,
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": "vera_reply", "strict": True, "schema": FINAL_REPLY_SCHEMA}},
        "provider": {"require_parameters": True, "sort": "throughput"},
    }


def _headers(key, config):
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if config.openrouter_http_referer:
        headers["HTTP-Referer"] = config.openrouter_http_referer
    if config.openrouter_x_title:
        headers["X-Title"] = config.openrouter_x_title
    return headers


def _judged(text):
    """SPEC §15's guardrail (`proposals.FORBIDDEN`), applied to whatever the provider wants to say to the
    person — never let a provider's judgment-language slip past a tool call's own validation into a plain
    reply."""
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


def _tool_step(message) -> BrainStep:
    calls = message.get("tool_calls") or []
    if not calls:
        raise BrainError("El proveedor marcó finish_reason='tool_calls' sin incluir ninguna llamada.")
    call = calls[0]["function"]
    try:
        arguments = json.loads(call["arguments"])
    except (KeyError, json.JSONDecodeError) as error:
        raise BrainError(f"Argumentos de herramienta inválidos: {error}") from error
    return BrainStep(tool_call=ToolCall(name=call["name"], arguments=arguments))


class OpenRouterBrain:
    """`CHAT_BRAIN=openrouter`: one OpenRouter Chat Completions call per round (see the module docstring for
    why it needs no state of its own between rounds)."""
    mode = "ai"

    def next_step(self, ctx: RoundContext) -> BrainStep:
        from ..config import settings
        config = settings()
        key = config.openrouter_api_key
        if not key:
            raise BrainError("Falta OPENROUTER_API_KEY; no se puede llamar al proveedor.")
        try:
            with httpx.Client(timeout=config.openrouter_timeout_seconds) as http_client:
                response = http_client.post(config.openrouter_base_url, headers=_headers(key, config),
                                            json=_request_body(ctx, config))
        except httpx.TimeoutException as error:
            raise BrainError(f"Tiempo de espera agotado con el proveedor: {error}") from error
        except httpx.HTTPError as error:
            raise BrainError(f"Error de red con el proveedor: {error}") from error
        if response.status_code >= 400:
            raise BrainError(f"El proveedor respondió {response.status_code}: {response.text[:500]}")
        try:
            payload = response.json()
            choice = payload["choices"][0]
        except (KeyError, IndexError, json.JSONDecodeError) as error:
            raise BrainError(f"Respuesta del proveedor mal formada: {error}") from error
        finish_reason = choice.get("finish_reason")
        message = choice.get("message") or {}
        if message.get("refusal"):
            raise BrainError(f"El proveedor rechazó la solicitud: {message['refusal']}")
        if finish_reason == "content_filter":
            raise BrainError("El proveedor cortó la respuesta por su propio filtro de contenido.")
        if finish_reason == "length":
            raise BrainError("La respuesta del proveedor se truncó por el límite de tokens.")
        if finish_reason == "tool_calls":
            return _tool_step(message)
        text = message.get("content")
        if text is None:
            raise BrainError(f"finish_reason inesperado sin contenido de texto: {finish_reason!r}")
        return _final_step(text)
