"""EST-04 (issue #10): the `AgentBrain` interface every provider — real or scripted — implements, and the
factory that picks one from `settings().chat_brain`. `turn.py` drives a brain one round at a time (at most
`MAX_ROUNDS`, see `turn.py`), so the interface is per-round, not per-turn: the brain reads the current case
state, the recent history and whatever tool results already happened this turn, and either asks for one more
tool call or gives its final answer. The tool call itself always runs through `agent/tools.py`'s single
validated executor — this is what lets `ScriptedBrain` (this phase) and the future Claude brain (EST-05)
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
    is only `round_results`, one entry longer every time `turn.py` runs the tool call the brain asked for."""
    case_state: CaseState
    recent_messages: list[ChatMessage]
    user_text: str
    attachment_ids: list[str]
    round_results: list[RoundResult] = field(default_factory=list)


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
    """Factory by `CHAT_BRAIN` (`config.py`). `claude` (EST-05, `agent/llm.py::ClaudeBrain`) is the real
    provider brain; `turn.py` falls back to a fresh `ScriptedBrain` for the whole turn if it ever raises
    `agent/llm.py::BrainError` (missing key, any typed SDK error, a refusal/max_tokens stop, or a reply that
    failed the judgment-language guardrail) — never a 5xx, never a half-written turn."""
    from ..config import settings
    chosen = name or settings().chat_brain
    if chosen == "scripted":
        from .scripted import ScriptedBrain
        return ScriptedBrain()
    if chosen == "claude":
        from .llm import ClaudeBrain
        return ClaudeBrain()
    raise ValueError(f"CHAT_BRAIN desconocido: {chosen!r}")
