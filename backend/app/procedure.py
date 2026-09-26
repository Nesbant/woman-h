"""Regulatory milestones shown to the institution (SPEC §8-9). Tracking only: no legal automation."""

# Only deadlines stated in SPEC.md are shown as references. Business-day calculation is out of scope (SPEC §53).
STEPS = [
    ("rights_info", "Información de derechos", "Dejar constancia de la información entregada a la persona", None),
    ("medical_psych", "Atención médica / psicológica", "Poner a disposición los canales de atención", "Ref. máx. 1 día hábil"),
    ("protection_measures", "Medidas de protección", "Registrar las medidas adoptadas · VERA no elige la medida", "Ref. máx. 3 días hábiles"),
    ("committee_transfer", "Traslado al Comité", "Comité de Intervención frente al Hostigamiento Sexual", None),
    ("investigation_report", "Investigación e informe", "Checkpoint · plazo regulatorio del Comité", None),
    ("decision", "Decisión", "Emitida por RR. HH. u órgano correspondiente · no generada por IA", None),
    ("mtpe_communication", "Comunicación MTPE", "Recepción, medidas adoptadas y decisión final · sin integración en el MVP", None),
]
STATUSES = ("pending", "in_progress", "done")
EMPTY = {"status": "pending", "updated_at": None, "updated_by": None}


def initial_procedure():
    return {key: dict(EMPTY) for key, _, _, _ in STEPS}


def step_state(value):
    # Cases created before the tri-state checklist stored {"done": bool}.
    if value and "status" not in value:
        return {"status": "done" if value.get("done") else "pending", "updated_at": value.get("done_at"),
                "updated_by": value.get("done_by")}
    return value or dict(EMPTY)


def procedure_view(state):
    return [{"key": key, "label": label, "description": description, "reference": reference, **step_state(state.get(key))}
            for key, label, description, reference in STEPS]
