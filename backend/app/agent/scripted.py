"""EST-04 (issue #10): the scripted fallback brain — no LLM, deterministic rules over the message text,
sharing every guarantee `agent/tools.py` enforces (the same tool executor a real Claude brain, EST-05, would
call). Recognizes the five confirm-style phrases the epic names ("guárdalo", "regístralo", "anota eso",
"quiero dejar constancia", "eso también…"), extracts one candidate fact per narrating message using
`sources.literal_date` for its date (never resolving a relative one), and asks a clarifying question instead
of guessing when a confirm/discard phrase matches zero or several open candidates — never silently picking
one. Reply text comes from `demo_script.json`, María's demo narrative in tone (see `seed.py`)."""
import json
from pathlib import Path
from ..proposals import clean_text, short_title
from ..sources import literal_date
from .brain import BrainStep, RoundContext, ToolCall
from .contracts import SuggestedAction

SCRIPT = json.loads((Path(__file__).parent / "demo_script.json").read_text(encoding="utf-8"))

CONFIRM_PHRASES = ("guárdalo", "regístralo", "anota eso", "quiero dejar constancia", "eso también")
DISCARD_PHRASES = ("descártalo", "no lo incluyas", "quita eso", "no lo cuentes")
SHARE_PHRASES = ("vista previa", "qué se compartiría", "qué compartiría", "compartir esto", "compartir eso")


def _squash(text):
    return " ".join(text.split()).casefold()


def _matches(text, phrases):
    squashed = _squash(text)
    return next((phrase for phrase in phrases if phrase in squashed), None)


def _open_candidates(case_state):
    return [event for event in case_state.events if event.status == "candidate"]


def _succeeded(round_results, name):
    return [result for result in round_results if result.name == name and not result.is_error]


def _title_of(case_state, event_id):
    return next((event.title for event in case_state.events if event.id == event_id), None) or "ese hecho"


class ScriptedBrain:
    """Stateless per call: everything it needs is in the `RoundContext` it receives (`mode='demo'`, as the
    contract's `BrainMode` requires for every reply this brain produces)."""
    mode = "demo"

    def next_step(self, ctx: RoundContext) -> BrainStep:
        if ctx.round_results:
            # A tool already ran this turn: in demo mode, one round of narration/confirm/discard/share is
            # always final; only attach_evidence may chain (one file per round, see `_finalize`).
            return self._finalize(ctx)
        if ctx.attachment_ids:
            return self._attach(ctx)
        confirm_phrase = _matches(ctx.user_text, CONFIRM_PHRASES)
        if confirm_phrase:
            return self._toward(ctx, confirm_phrase, "confirm_event", "confirm_none_open")
        discard_phrase = _matches(ctx.user_text, DISCARD_PHRASES)
        if discard_phrase:
            return self._toward(ctx, discard_phrase, "discard_event", "discard_none_open")
        if _matches(ctx.user_text, SHARE_PHRASES):
            return BrainStep(tool_call=ToolCall("prepare_share_preview", {}))
        return self._narrate(ctx)

    # --- narrate: one candidate per message, dated only from what is literally written -----------------

    def _narrate(self, ctx: RoundContext) -> BrainStep:
        description = clean_text(ctx.user_text, 2000)
        if not description:
            return BrainStep(tool_call=None, reply_text=SCRIPT["narrate_needs_clarification"])
        title = clean_text(short_title(description), 200) or "Hecho contado en el chat"
        dates = literal_date(description)
        arguments = {"event_id": None, "title": title, "description": description, **dates, "event_time": None,
                    "origin": "user_statement", "user_quote": description}
        return BrainStep(tool_call=ToolCall("create_or_update_candidate_event", arguments))

    # --- confirm / discard: never guess which candidate when it is not exactly one -----------------------

    def _toward(self, ctx: RoundContext, phrase: str, tool_name: str, none_open_key: str) -> BrainStep:
        open_candidates = _open_candidates(ctx.case_state)
        if not open_candidates:
            return BrainStep(tool_call=None, reply_text=SCRIPT[none_open_key])
        if len(open_candidates) > 1:
            titles = ", ".join(f"«{event.title}»" for event in open_candidates)
            return BrainStep(tool_call=None, reply_text=SCRIPT["ambiguous_candidates"].format(titles=titles))
        target = open_candidates[0]
        return BrainStep(tool_call=ToolCall(tool_name, {"event_id": target.id, "user_quote": phrase}))

    # --- attach_evidence: one file per round, chained through `_finalize` until all are linked -----------

    def _attach(self, ctx: RoundContext) -> BrainStep:
        already = len(_succeeded(ctx.round_results, "attach_evidence"))
        if already >= len(ctx.attachment_ids):
            return self._finalize(ctx)
        if not ctx.case_state.events:
            return BrainStep(tool_call=None, reply_text=SCRIPT["attach_evidence_missing_event"])
        target = ctx.case_state.events[-1]  # the most recently added fact: the only signal available here
        return BrainStep(tool_call=ToolCall("attach_evidence", {"event_id": target.id, "file_id": ctx.attachment_ids[already]}))

    # --- final reply, from whatever this turn's last tool call answered -----------------------------------

    def _finalize(self, ctx: RoundContext) -> BrainStep:
        last = ctx.round_results[-1]
        if last.is_error:
            return BrainStep(tool_call=None, reply_text=SCRIPT["tool_error"].format(message=last.content.get("message", "")))
        if last.name == "create_or_update_candidate_event":
            return BrainStep(tool_call=None, reply_text=SCRIPT["narrate"].format(title=_title_of(ctx.case_state, last.content["event_id"])),
                             suggested_actions=[SuggestedAction(type="review_timeline", label="Ver este hecho en tu cronología",
                                                                event_ids=[last.content["event_id"]])])
        if last.name == "confirm_event":
            return BrainStep(tool_call=None, reply_text=SCRIPT["confirm"].format(title=_title_of(ctx.case_state, last.content["event_id"])))
        if last.name == "discard_event":
            return BrainStep(tool_call=None, reply_text=SCRIPT["discard"].format(title=_title_of(ctx.case_state, last.content["event_id"])))
        if last.name == "attach_evidence":
            if len(_succeeded(ctx.round_results, "attach_evidence")) < len(ctx.attachment_ids):
                return self._attach(ctx)  # more attachments in this same message: keep going
            return BrainStep(tool_call=None, reply_text=SCRIPT["attach_evidence"].format(title=_title_of(ctx.case_state, last.content["event_id"])))
        if last.name == "prepare_share_preview":
            return BrainStep(tool_call=None, reply_text=SCRIPT["share_preview"],
                             suggested_actions=[SuggestedAction(type="open_share_preview", label="Ver la vista previa",
                                                                event_ids=last.content["event_ids"], file_ids=last.content["file_ids"])])
        return BrainStep(tool_call=None, reply_text=SCRIPT["fallback"])
