"""Rules for the six sections of a private complaint draft. Pure functions: no HTTP, no persistence.

Only events the person accepted and their confirmed profile feed the draft. Missing data stays empty, and a
name VERA detects is prefilled as pending: it never counts as confirmed until the person says so.
"""

# VERA explains each option in plain language; the person chooses and the organization decides.
MEASURES = {
    "respondent_rotation": ("Rotación o cambio de lugar de la persona mencionada",
                            "Separar los espacios de trabajo mientras dura el procedimiento."),
    "no_contact": ("Impedimento de acercamiento o contacto", "Evitar comunicación directa con la persona mencionada."),
    "reporting_line": ("Cambio de línea de reporte", "Que tu supervisión o evaluación la realice otra persona."),
    "other": ("Otra medida", "Podrás describirla a la organización con tus palabras."),
}
AFFECTED = ("name", "document", "contact", "position", "area", "relationship")
RESPONDENT = ("name", "position", "area", "relationship")
PROFILE_FIELDS = tuple(key for key in AFFECTED if key != "name")


def field(value=None, origin=None):
    return {"value": value, "origin": origin if value else None}


def sources_of(event):
    return event.get('sources') or [event['source']]


def document_refs(event):
    """One reference per document: several quoted fragments of the same relato count once."""
    return list({(s['kind'], s['source_id'], s['label']): {"kind": s['kind'], "source_id": s['source_id'], "label": s['label']}
                 for s in sources_of(event)}.values())


def fact_from(event, previous):
    fact = {"event_id": event['id'], "title": event.get('title') or event['description'][:80],
            "description": event['description'], "date_kind": event['date_kind'], "event_date": event['event_date'],
            "approximate_date": event['approximate_date'], "event_time": event.get('event_time'),
            "sources": document_refs(event), "edited": False}
    if previous and previous['edited']:
        fact.update(description=previous['description'], edited=True)
    return fact


def facts_from(events, previous_facts):
    """Accepted events in timeline order; a description the person edited in the draft is kept."""
    kept = {fact['event_id']: fact for fact in previous_facts}
    return [fact_from(event, kept.get(event['id'])) for event in events if event['status'] == 'accepted']


def parse_mentioned(mentioned):
    """'Juan X. · Supervisor' → ('Juan X.', 'Supervisor')."""
    name, _, position = (part.strip() for part in mentioned.split("\n")[0].partition("·"))
    return name or None, position or None


def detection(mentioned, events):
    """Where a name the person wrote also appears among the cited file fragments."""
    if not mentioned:
        return None
    name, position = parse_mentioned(mentioned)
    files = sorted({s['label'].replace(" · tu descripción", "") for event in events for s in sources_of(event)
                    if s['kind'] == 'file' and name and name in s['quote']})
    return {"name": name, "position": position, "found_in": ["tu relato"] + files}


def affected_from(user, profile):
    return {"name": field(user.name, "profile"),
            **{key: field(getattr(profile, key) if profile else None, "profile") for key in PROFILE_FIELDS}}


def respondent_from(detected):
    fields = {key: field() for key in RESPONDENT}
    if detected:
        fields.update(name=field(detected['name'], "detected"), position=field(detected['position'], "detected"))
    return fields


def build_fields(user, profile, events, mentioned, previous=None):
    """Creates or refreshes the draft. Sections the person already worked on are kept as they are."""
    previous = previous or {}
    facts = facts_from(events, previous.get('facts', {}).get('events', []))
    detected = detection(mentioned, events)
    return {
        "affected": previous.get('affected') or affected_from(user, profile),
        "respondent": previous.get('respondent') or respondent_from(detected),
        "respondent_confirmed": previous.get('respondent_confirmed', False),
        "respondent_detection": detected,
        "reporter": previous.get('reporter') or {"same_as_affected": True, "name": field(user.name, "profile")},
        "facts": {"events": facts, "consequences": previous.get('facts', {}).get('consequences') or field()},
        "evidence": {"file_ids": sorted({s['source_id'] for fact in facts for s in fact['sources'] if s['kind'] == 'file'})},
        "protection_measures": previous.get('protection_measures') or {"selected": [], "other": None},
    }


def source_map(fields):
    mapping = {f"facts.{fact['event_id']}": [s['label'] for s in fact['sources']] for fact in fields['facts']['events']}
    mapping.update({f"affected.{key}": "Perfil" for key, value in fields['affected'].items() if value['origin'] == "profile"})
    return mapping


def merged(current, value):
    """Keeps the origin of an unchanged value; anything the person types becomes theirs."""
    value = value or None
    return current if value == current['value'] else field(value, "person")


def merge_section(current, incoming, keys):
    return {key: merged(current[key], incoming[key].value if key in incoming else current[key]['value']) for key in keys}


def edited_facts(facts, edits):
    return [{**fact, "description": edits[fact['event_id']], "edited": True}
            if fact['event_id'] in edits and edits[fact['event_id']] != fact['description'] else fact for fact in facts]


def apply_edit(fields, data):
    """The person's edit of every section. Returns None if it touches facts that are not in the draft."""
    edits = {fact.event_id: fact.description for fact in data.facts}
    if not set(edits) <= {fact['event_id'] for fact in fields['facts']['events']}:
        return None
    respondent = merge_section(fields['respondent'], data.respondent, RESPONDENT)
    return {**fields,
            "affected": merge_section(fields['affected'], data.affected, AFFECTED),
            "respondent": respondent,
            # Typing the name yourself is a confirmation; a detected name stays pending until confirmed.
            "respondent_confirmed": fields.get('respondent_confirmed', False) or respondent['name']['origin'] == "person",
            "reporter": {"same_as_affected": data.reporter_same_as_affected,
                         "name": merged(fields['reporter']['name'], data.reporter_name.value)},
            "facts": {"events": edited_facts(fields['facts']['events'], edits),
                      "consequences": merged(fields['facts']['consequences'], data.consequences.value)},
            "protection_measures": {"selected": sorted(set(data.measures)), "other": data.measures_other or None}}


def date_gap(fact):
    detail = (f"La evidencia solo respalda “{fact['approximate_date']}”." if fact['approximate_date']
              else "La evidencia no permite determinar una fecha.")
    return {"key": f"date.{fact['event_id']}", "title": f"Fecha exacta · {fact['title']}", "detail": detail}


def pending(fields, has_place, waiting):
    """What is still unconfirmed. Informative only: the person can always continue."""
    items = []
    if fields['respondent']['name']['value'] and not fields['respondent_confirmed']:
        items.append({"key": "respondent", "title": "Identidad de la persona mencionada",
                      "detail": "Detectada por VERA; requiere tu confirmación."})
    items += [date_gap(fact) for fact in fields['facts']['events'] if fact['date_kind'] != 'exact']
    if not has_place:
        items.append({"key": "place", "title": "Lugar de los hechos", "detail": "No aparece en las evidencias revisadas."})
    if waiting:
        items.append({"key": "events", "title": f"{waiting} {'evento' if waiting == 1 else 'eventos'} sin revisar",
                      "detail": "No se incluyen en el borrador hasta que los confirmes."})
    return items
