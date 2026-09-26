"""EST-04 (issue #10); revised for fact-detection slice 1: the scripted fallback brain — no LLM, deterministic
rules over the message text, sharing every guarantee `agent/tools.py` enforces (the same tool executor the
real OpenRouter brain, EST-05, uses). Recognizes the confirm/discard-style phrases the epic names
("guárdalo", "regístralo", "anota eso", "quiero dejar constancia", "eso también…", or plain "guarda"), splits
a narrating message into clauses (sentences, and " y " / "; " / "después" joining distinct actions) and
creates one candidate per clause that reads like a concrete action/event — never for a clause that is only an
emotion, opinion, interpretation, question, hypothesis or request for advice, which stays in the conversation
without creating anything. Dates come from `sources.literal_date` (never resolving a relative one). When a
confirm/discard phrase matches several open candidates, tries to narrow it down by the referent words in the
message (e.g. "el del mensaje") before asking a clarifying question — never silently picking one. Reply text
comes from `demo_script.json`, María's demo narrative in tone (see `seed.py`)."""
import json
import re
from pathlib import Path
from ..proposals import clean_text, short_title
from ..sources import literal_date
from .brain import BrainStep, RoundContext, ToolCall
from .contracts import SuggestedAction

SCRIPT = json.loads((Path(__file__).parent / "demo_script.json").read_text(encoding="utf-8"))

CONFIRM_PHRASES = ("guárdalo", "regístralo", "anota eso", "quiero dejar constancia", "eso también", "guarda")
DISCARD_PHRASES = ("descártalo", "no lo incluyas", "quita eso", "no lo cuentes")
# A message that only talks about the file it carries ("subí una captura…") adds evidence, not a new fact.
EVIDENCE_PHRASES = ("subí", "adjunto", "adjunté", "te paso", "aquí está", "acá está", "captura", "archivo", "foto")
SHARE_PHRASES = ("vista previa", "qué se compartiría", "qué compartiría", "compartir esto", "compartir eso")

# --- clause splitting: one message may narrate several distinct events -------------------------------------
# Joins a sentence break (a period/!/? followed by whitespace), a semicolon, " después " or " y " — the same
# conjunctions the fact spec names for "several distinguishable events in one message".
CLAUSE_JOINERS = re.compile(r"(?<=[.!?])\s+|\s*;\s+|\s+después,?\s+|\s+y\s+", re.I)

# Conservative stems/words for a concrete action or event (SPEC: "acción, mensaje, comentario, encuentro,
# llamada, correo, contacto físico, interacción o situación identificable"). Stems (not full conjugations) so
# both "escribió" and "volvió a escribir" match, at the conservative cost of an occasional false positive —
# acceptable for a demo fallback that a real provider always take precedence over when configured.
ACTION_MARKERS = ("escrib", "mandó", "mandad", "dij", "llam", "coment", "grit", "tocó", "acercó", "citó",
                  "reuni", "correo", "mensaje", "encuentro", "contacto")
# Emotions, opinions, interpretations, hypotheses or requests for advice never create a fact on their own.
NON_FACT_MARKERS = ("me siento", "siento que", "creo que", "me parece", "pienso que", "opino",
                    "seguramente", "seguro que", "seguro quería", "seguro queria", "tal vez", "quizá",
                    "quizás", "supongo", "capaz que", "qué hago", "que hago", "debería", "deberías",
                    "consejo", "me recomiendas", "recomiéndame", "qué opinas", "que opinas")
# A confirm/discard phrase matching several open candidates is narrowed down by these referent words before
# asking; e.g. "guarda el del mensaje" should find the candidate built from an "escribió"/"mandó" clause even
# though it never literally says "mensaje" itself.
REFERENT_SYNONYMS = {
    "mensaje": ("mensaje", "escrib", "mandó", "mandad"),
    "reunión": ("reuni", "coment", "dij"),
    "reunion": ("reuni", "coment", "dij"),
    "llamada": ("llam",),
    "correo": ("correo",),
    "encuentro": ("encuentro", "acercó", "tocó"),
}


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


def _tells_new_fact(text):
    return literal_date(text)["date_kind"] != "unknown" or not _matches(text, EVIDENCE_PHRASES)


def _clauses(text):
    """The message split into candidate clauses, one per distinguishable action/event. Each clause is a
    literal substring of `text` (whitespace-trimmed only), so it always survives `tools.quote_in_message`."""
    return [part.strip(" ,") for part in CLAUSE_JOINERS.split(text) if part and part.strip(" ,")]


def _is_fact_clause(clause):
    """A clause becomes a candidate only if it reads like a concrete action/event and not merely an emotion,
    opinion, interpretation, question, hypothesis or request for advice."""
    if "?" in clause or "¿" in clause:
        return False
    if _matches(clause, NON_FACT_MARKERS):
        return False
    return _matches(clause, ACTION_MARKERS) is not None


def _fact_clauses(text):
    return [clause for clause in _clauses(text) if _is_fact_clause(clause)]


def _referent_words(text):
    squashed = _squash(text)
    words = set()
    for key, synonyms in REFERENT_SYNONYMS.items():
        if key in squashed:
            words.update(synonyms)
    return words


def _event_haystack(event):
    quotes = " ".join(event.support_quotes or [])
    return _squash(f"{event.title} {event.description} {event.source.quote} {quotes}")


def _matches_referent(event, words):
    haystack = _event_haystack(event)
    return any(word in haystack for word in words)


class ScriptedBrain:
    """Stateless per call: everything it needs is in the `RoundContext` it receives (`mode='demo'`, as the
    contract's `BrainMode` requires for every reply this brain produces)."""
    mode = "demo"

    def next_step(self, ctx: RoundContext) -> BrainStep:
        if ctx.round_results:
            if ctx.attachment_ids:
                # A message with files: unchanged chaining (narrate once, then attach — see `_finalize`).
                return self._finalize(ctx)
            last = ctx.round_results[-1]
            if last.name == "create_or_update_candidate_event" and not last.is_error:
                # Still narrating: keep creating one candidate per remaining fact-clause, then wrap up.
                return self._continue_narrate(ctx)
            return self._finalize(ctx)
        if ctx.attachment_ids:
            # A message with a file that narrates something (or is dated) is a new fact plus its evidence: narrate first, then link the file
            # to that new candidate (`_finalize`). Otherwise the file belongs to the most recent fact.
            return self._narrate_single(ctx) if _tells_new_fact(ctx.user_text) else self._attach(ctx)
        confirm_phrase = _matches(ctx.user_text, CONFIRM_PHRASES)
        if confirm_phrase:
            return self._toward(ctx, confirm_phrase, "confirm_event", "confirm_none_open")
        discard_phrase = _matches(ctx.user_text, DISCARD_PHRASES)
        if discard_phrase:
            return self._toward(ctx, discard_phrase, "discard_event", "discard_none_open")
        if _matches(ctx.user_text, SHARE_PHRASES):
            return BrainStep(tool_call=ToolCall("prepare_share_preview", {}))
        return self._narrate(ctx)

    # --- narrate: one candidate per distinguishable fact-clause, dated only from what is literally written --

    def _create_clause(self, clause: str) -> BrainStep:
        description = clean_text(clause, 2000) or clause
        title = clean_text(short_title(description), 200) or "Hecho contado en el chat"
        dates = literal_date(clause)
        arguments = {"event_id": None, "title": title, "description": description, **dates, "event_time": None,
                    "origin": "user_statement", "user_quote": clause}
        return BrainStep(tool_call=ToolCall("create_or_update_candidate_event", arguments))

    def _narrate(self, ctx: RoundContext) -> BrainStep:
        """First round of a plain narrating message (no attachments): split it into clauses and create a
        candidate for the first one that reads like a concrete fact. Zero fact-clauses (only emotions,
        opinions, interpretations, questions, hypotheses or requests for advice) never call a tool."""
        description = clean_text(ctx.user_text, 2000)
        if not description:
            return BrainStep(tool_call=None, reply_text=SCRIPT["narrate_needs_clarification"])
        clauses = _fact_clauses(ctx.user_text)
        if not clauses:
            return BrainStep(tool_call=None, reply_text=SCRIPT["no_fact_detected"])
        return self._create_clause(clauses[0])

    def _continue_narrate(self, ctx: RoundContext) -> BrainStep:
        """Round 2+ of a plain narrating message: keep creating one candidate per remaining fact-clause
        (bounded by the orchestrator's own `MAX_ROUNDS`), then reply once every fact-clause has its own
        candidate."""
        clauses = _fact_clauses(ctx.user_text)
        created = _succeeded(ctx.round_results, "create_or_update_candidate_event")
        if len(created) < len(clauses):
            return self._create_clause(clauses[len(created)])
        return self._finalize_narrate(ctx, created)

    def _finalize_narrate(self, ctx: RoundContext, created) -> BrainStep:
        event_ids = [result.content["event_id"] for result in created]
        if len(event_ids) == 1:
            return BrainStep(tool_call=None, reply_text=SCRIPT["narrate"].format(title=_title_of(ctx.case_state, event_ids[0])),
                             suggested_actions=[SuggestedAction(type="review_timeline", label="Ver este hecho en tu cronología",
                                                                event_ids=event_ids)])
        titles = ", ".join(f"«{_title_of(ctx.case_state, event_id)}»" for event_id in event_ids)
        return BrainStep(tool_call=None, reply_text=SCRIPT["narrate_multi"].format(count=len(event_ids), titles=titles),
                         suggested_actions=[SuggestedAction(type="review_timeline", label="Ver estos hechos en tu cronología",
                                                            event_ids=event_ids)])

    # --- narrate_single: the attachment path's original one-candidate-per-message narration, unchanged -----

    def _narrate_single(self, ctx: RoundContext) -> BrainStep:
        description = clean_text(ctx.user_text, 2000)
        if not description:
            return BrainStep(tool_call=None, reply_text=SCRIPT["narrate_needs_clarification"])
        return self._create_clause(description)

    # --- confirm / discard: never guess which candidate when it is not exactly one -----------------------

    def _toward(self, ctx: RoundContext, phrase: str, tool_name: str, none_open_key: str) -> BrainStep:
        open_candidates = _open_candidates(ctx.case_state)
        if not open_candidates:
            return BrainStep(tool_call=None, reply_text=SCRIPT[none_open_key])
        if len(open_candidates) > 1:
            words = _referent_words(ctx.user_text)
            matched = [event for event in open_candidates if _matches_referent(event, words)] if words else []
            if len(matched) == 1:
                target = matched[0]
                return BrainStep(tool_call=ToolCall(tool_name, {"event_id": target.id, "user_quote": phrase}))
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
        created = _succeeded(ctx.round_results, "create_or_update_candidate_event")
        target_id = created[-1].content["event_id"] if created else ctx.case_state.events[-1].id  # else the latest fact
        return BrainStep(tool_call=ToolCall("attach_evidence", {"event_id": target_id, "file_id": ctx.attachment_ids[already]}))

    # --- final reply, from whatever this turn's last tool call answered -----------------------------------

    def _finalize(self, ctx: RoundContext) -> BrainStep:
        last = ctx.round_results[-1]
        if last.is_error:
            return BrainStep(tool_call=None, reply_text=SCRIPT["tool_error"].format(message=last.content.get("message", "")))
        if last.name == "create_or_update_candidate_event":
            if ctx.attachment_ids:
                return self._attach(ctx)  # the new fact came with files: link them to it
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
