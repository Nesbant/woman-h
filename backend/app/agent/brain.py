"""EST-04 (issue #10): the `AgentBrain` interface every provider — real or scripted — implements, and the
factory that picks one from `settings().chat_brain`. `turn.py` drives a brain one round at a time (at most
`MAX_ROUNDS`, see `turn.py`), so the interface is per-round, not per-turn: the brain reads the current case
state, the recent history and whatever tool results already happened this turn, and either asks for one more
tool call or gives its final answer. The tool call itself always runs through `agent/tools.py`'s single
validated executor — this is what lets `ScriptedBrain` (this phase) and the future OpenRouter brain (EST-05)
share every guarantee `tools.py` enforces, instead of each brain re-implementing its own validation."""
from dataclasses import dataclass, field
from typing import Protocol
from .contracts import BrainMode, CaseState, ChatMessage, SuggestedAction


@dataclass
class ToolCall:
    name: str
    arguments: dict


@dataclass
class RoundResult:
    """One past round of this turn: what was called, and what `tools.execute` answered."""
    name: str
    arguments: dict
    content: dict
    is_error: bool


@dataclass
class RoundContext:
    """Everything a brain needs to decide its next step. Immutable for the round: what grows across rounds
    is only `round_results`, one entry longer every time `turn.py` runs the tool call the brain asked for.

    `final_only`: set only for the one extra round `turn.py` grants after `MAX_ROUNDS` tool rounds are spent
    (see `turn._run_brain`) — the brain must answer with `reply_text` this round, never another tool call.
    `OpenRouterBrain` turns this into `tool_choice: "none"` on that one request (`tools` stays in the body so
    the reconstructed history's earlier `tool_calls` messages stay valid); `ScriptedBrain` already always
    finalizes once every fact-clause has a candidate, so it never even reaches this round with a tool call
    still pending and ignores the flag."""
    case_state: CaseState
    recent_messages: list[ChatMessage]
    user_text: str
    attachment_ids: list[str]
    round_results: list[RoundResult] = field(default_factory=list)
    final_only: bool = False


@dataclass
class BrainStep:
    """Either `tool_call` is set (run it through `tools.execute`, then call `next_step` again with the
    result appended to `round_results`), or it is `None` and `reply_text`/`suggested_actions` are the
    turn's final answer."""
    tool_call: ToolCall | None
    reply_text: str | None = None
    suggested_actions: list[SuggestedAction] = field(default_factory=list)


class AgentBrain(Protocol):
    mode: BrainMode

    def next_step(self, ctx: RoundContext) -> BrainStep: ...


def get_brain(name: str | None = None) -> AgentBrain:
    """Factory by `CHAT_BRAIN` (`config.py`). `openrouter` (EST-05, `agent/openrouter.py::OpenRouterBrain`) is
    the real provider brain; `turn.py` falls back to a fresh `ScriptedBrain` for the whole turn if it ever
    raises `agent/openrouter.py::BrainError` (missing key, any HTTP/timeout error, a `length`/`content_filter`
    finish reason, a refusal, malformed structured output, or a reply that failed the judgment-language
    guardrail) — never a 5xx, never a half-written turn."""
    from ..config import settings
    chosen = name or settings().chat_brain
    if chosen == "scripted":
        from .scripted import ScriptedBrain
        return ScriptedBrain()
    if chosen == "openrouter":
        from .openrouter import OpenRouterBrain
        return OpenRouterBrain()
    raise ValueError(f"CHAT_BRAIN desconocido: {chosen!r}")
