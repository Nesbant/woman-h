"""Fact-detection slice 1: `SYSTEM_PROMPT` uses tuteo (never voseo), never limits VERA to one tool call per
*turn* (the orchestrator allows up to `turn.MAX_ROUNDS` per message), and spells out what counts as a fact.
`pytest tests/test_agent_prompt.py`."""
import re
from app.agent.prompt import SYSTEM_PROMPT

VOSEO = re.compile(r"\b(sos|tenés|podés|querés|contame|anotá|fijate|descartalo|quitá)\b", re.I)

FACT_EXAMPLES = ("Ayer me escribió a las 11 preguntándome si estaba despierta.",
                 "En la reunión hizo un comentario sobre mi cuerpo.",
                 "Después me mandó otro mensaje.",
                 "El viernes me llamó tres veces.")
NON_FACT_EXAMPLES = ("me siento incómoda", "creo que es raro", "seguro quería intimidarme")


def test_prompt_has_no_voseo_markers():
    assert VOSEO.search(SYSTEM_PROMPT) is None


def test_prompt_never_limits_to_one_tool_call_per_turn():
    # The old (wrong) text said "una sola llamada por turno"; the orchestrator (`turn.MAX_ROUNDS`) allows up
    # to 4 tool rounds per message, one call per round.
    assert "una sola llamada" not in SYSTEM_PROMPT


def test_prompt_defines_what_a_fact_is_with_the_spec_examples():
    assert "Qué es un hecho" in SYSTEM_PROMPT
    for example in FACT_EXAMPLES:
        assert example in SYSTEM_PROMPT
    for non_example in NON_FACT_EXAMPLES:
        assert non_example in SYSTEM_PROMPT


def test_prompt_allows_several_candidates_per_message_across_rounds():
    assert "4 rondas" in SYSTEM_PROMPT


def test_prompt_states_detecting_is_not_confirming():
    assert "guárdalo" in SYSTEM_PROMPT and "quiero dejar constancia" in SYSTEM_PROMPT


def test_prompt_never_interpolates_anything():
    # Byte-stable across requests/turns/cases (see `agent/openrouter.py`'s prompt-caching note): a plain
    # string literal with no format placeholders left unresolved.
    assert "{" not in SYSTEM_PROMPT and "}" not in SYSTEM_PROMPT
