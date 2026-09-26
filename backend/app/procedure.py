"""Regulatory milestones shown to the institution (SPEC §8-9). Tracking only: no legal automation."""

# Only deadlines stated in SPEC.md are shown as references. Business-day calculation is out of scope (SPEC §53).
STEPS = [
    ("rights_info", "Información de derechos entregada", None),
    ("medical_psych", "Atención médica / psicológica", "máximo 1 día hábil"),
    ("protection_measures", "Medidas de protección", "máximo 3 días hábiles"),
    ("committee_transfer", "Traslado al Comité", None),
    ("investigation_report", "Investigación e informe del Comité", None),
    ("decision", "Decisión", None),
    ("mtpe_communication", "Comunicación MTPE", None),
]


def initial_procedure():
    return {key: {"done": False, "done_at": None, "done_by": None} for key, _, _ in STEPS}


def procedure_view(state):
    return [{"key": key, "label": label, "reference": reference, **state.get(key, {"done": False, "done_at": None, "done_by": None})}
            for key, label, reference in STEPS]
