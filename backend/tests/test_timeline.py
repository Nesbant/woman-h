import pytest
from app.main import app
from app.timeline_ai import get_timeline_adapter
from conftest import login

MARIA = "maria@example.test"


class Stub:
    mode = "ai"

    def __init__(self, proposal=None, error=None):
        self.proposal, self.error, self.calls = proposal, error, []

    def propose(self, sources):
        self.calls.append(sources)
        if self.error:
            raise self.error
        return self.proposal(sources) if callable(self.proposal) else self.proposal


@pytest.fixture
def adapter():
    holder = {}
    app.dependency_overrides[get_timeline_adapter] = lambda: holder["value"]
    yield holder
    app.dependency_overrides.pop(get_timeline_adapter, None)


def analyze(client, record_id, revision=0):
    response = client.post(f"/api/records/{record_id}/timeline/analyze", json={"revision": revision})
    assert response.status_code == 200, response.text
    return response.json()


def own_record(client, text):
    record = client.post("/api/records", json={"title": "Ficticio", "description": text}).json()["id"]
    client.post(f"/api/records/{record}/accounts", json={"description": text, "date_kind": "unknown"})
    return record


def test_demo_fixture_produces_sourced_events_and_review_items(client, demo_record):
    login(client, MARIA)
    state = analyze(client, demo_record)
    assert state["mode"] == "fixture"
    events = state["events"]
    assert [event["title"] for event in events] == ["Reunión presencial con el supervisor",
                                                     "Mensajes recibidos fuera del horario laboral",
                                                     "Correo sobre la evaluación de desempeño"]
    for event in events:
        assert event["status"] == "proposed" and event["needs_review"] and not event["reviewed"]
        assert event["sources"] and event["source"] == event["sources"][0]
        quotes = " ".join(" ".join(source["quote"].split()) for source in event["sources"])
        assert all(" ".join(quote.split()) in quotes for quote in event["support_quotes"])
    meeting, messages, email = events
    assert meeting["date_kind"] == "approximate" and meeting["event_time"] is None
    assert (messages["event_date"], messages["event_time"]) == ("2026-09-16", "22:43")
    assert (email["event_date"], email["event_time"]) == ("2026-09-17", "09:12")
    assert messages["source"]["label"].startswith("captura_01.png")
    assert email["source"]["label"] == "correo_01.pdf"
    kinds = {item["kind"]: item for item in state["review_items"]}
    assert set(kinds) == {"date_inconsistency", "possible_relation", "unlinked_evidence"}
    assert kinds["date_inconsistency"]["event_ids"] == [messages["id"]]
    assert kinds["date_inconsistency"]["action_label"] == "Usar 16 sep"
    assert set(kinds["possible_relation"]["event_ids"]) == {meeting["id"], email["id"]}
    assert "captura_02.png" in kinds["unlinked_evidence"]["message"]
    assert all(item["status"] == "open" for item in state["review_items"])


def test_resolving_a_notice_annotates_its_events_without_changing_revision(client, demo_record):
    login(client, MARIA)
    state = analyze(client, demo_record)
    item = next(item for item in state["review_items"] if item["kind"] == "date_inconsistency")
    resolved = client.put(f"/api/records/{demo_record}/timeline/review-items/{item['id']}",
                          json={"revision": state["revision"], "status": "resolved"}).json()
    assert resolved["revision"] == state["revision"]
    noted = next(event for event in resolved["events"] if event["id"] == item["event_ids"][0])
    assert noted["note"] == "Fecha conservada según captura_01.png"
    reopened = client.put(f"/api/records/{demo_record}/timeline/review-items/{item['id']}",
                          json={"revision": state["revision"], "status": "open"}).json()
    assert "note" not in next(event for event in reopened["events"] if event["id"] == item["event_ids"][0])


def test_invented_clock_times_are_dropped(client, adapter):
    login(client)
    record = own_record(client, "El 03/09/2026 a las 10:15 hubo una reunión en la oficina.")
    adapter["value"] = Stub({"events": [
        {"title": "Reunión", "description": "Reunión en la oficina", "date_kind": "exact", "event_date": "2026-09-03",
         "event_time": "10:15", "support_quotes": ["El 03/09/2026 a las 10:15 hubo una reunión"]},
        {"title": "Otra", "description": "Reunión inventada", "date_kind": "exact", "event_date": "2026-09-03",
         "event_time": "23:59", "support_quotes": ["hubo una reunión en la oficina"]}]})
    state = analyze(client, record)
    assert [event["event_time"] for event in state["events"]] == ["10:15", None]


def test_unsupported_quotes_dates_and_judgements_are_never_stored(client, adapter):
    login(client)
    record = own_record(client, "El 03/09/2026 hubo una reunión en la oficina. Luego recibí un correo.")
    adapter["value"] = Stub(lambda sources: {"events": [
        {"description": "Evento inventado", "support_quotes": ["esto nunca fue escrito"], "source_ids": ["no-existe"]},
        {"description": "Reunión en la oficina", "date_kind": "exact", "event_date": "2026-09-14",
         "support_quotes": ["hubo una reunión en la oficina"]},
        {"description": "Correo recibido", "date_kind": "exact", "event_date": "2026-09-03",
         "support_quotes": ["El 03/09/2026 hubo una reunión"]},
        {"description": "Probabilidad de acoso: 87%", "support_quotes": ["Luego recibí un correo."]},
    ], "review_items": [{"kind": "possible_relation", "message": "Sin fuente", "support_quotes": ["inventado"]},
                        {"kind": "risk_score", "message": "La persona es culpable", "support_quotes": ["Luego recibí un correo."]}]})
    state = analyze(client, record)
    assert [event["description"] for event in state["events"]] == ["Reunión en la oficina", "Correo recibido"]
    invented, supported = state["events"]
    assert invented["date_kind"] == "unknown" and invented["event_date"] is None
    assert supported["date_kind"] == "exact" and supported["event_date"] == "2026-09-03"
    assert state["review_items"] == []
    assert any("Se descartaron 2" in warning for warning in state["warnings"])


def test_provider_failure_falls_back_without_breaking_the_flow(client, adapter):
    login(client)
    record = own_record(client, "Primera situación ficticia. Segunda situación ficticia.")
    adapter["value"] = Stub(error=RuntimeError("proveedor caído"))
    state = analyze(client, record)
    assert state["mode"] == "extractive"
    assert [event["description"] for event in state["events"]] == ["Primera situación ficticia.", "Segunda situación ficticia."]


def test_legacy_selected_ids_contract_still_supported(client, adapter, monkeypatch):
    from app.timeline_ai import HttpAdapter
    login(client)
    record = own_record(client, "Hecho uno ficticio. Hecho dos ficticio.")
    http = HttpAdapter(type("C", (), {"timeline_ai_url": "https://ia.example", "timeline_ai_key": None})())

    def fake_propose(self, sources):
        texts = {item["id"]: item["text"] for item in sources}
        return {"events": [{"description": texts[key], "source_ids": [key], "support_quotes": []}
                           for key in [sources[1]["id"]]], "review_items": []}
    monkeypatch.setattr(HttpAdapter, "propose", fake_propose)
    adapter["value"] = http
    state = analyze(client, record)
    assert state["mode"] == "ai"
    assert [event["description"] for event in state["events"]] == ["Hecho dos ficticio."]
    assert state["events"][0]["support_quotes"] == ["Hecho dos ficticio."]


def test_review_item_status_survives_reanalysis_without_changing_revision(client, demo_record):
    login(client, MARIA)
    state = analyze(client, demo_record)
    item = next(item for item in state["review_items"] if item["kind"] == "date_inconsistency")
    response = client.put(f"/api/records/{demo_record}/timeline/review-items/{item['id']}",
                          json={"revision": state["revision"], "status": "dismissed"})
    assert response.status_code == 200
    assert response.json()["revision"] == state["revision"]
    again = analyze(client, demo_record, state["revision"])
    assert next(i for i in again["review_items"] if i["id"] == item["id"])["status"] == "dismissed"


def test_multi_source_event_exposes_each_source(client, demo_record):
    login(client, MARIA)
    state = analyze(client, demo_record)
    event = next(event for event in state["events"] if event["event_date"] == "2026-09-16")
    source = event["sources"][0]
    response = client.get(f"/api/records/{demo_record}/timeline/events/{event['id']}/source", params={"source": source["id"]})
    assert response.status_code == 200
    assert response.json()["changed"] is False and "22:43" in response.json()["current_text"]
    missing = client.get(f"/api/records/{demo_record}/timeline/events/{event['id']}/source", params={"source": "otra"})
    assert missing.status_code == 404


def test_another_person_cannot_analyze_or_read_the_timeline(client, demo_record):
    login(client, "bea@example.test")
    assert client.get(f"/api/records/{demo_record}/timeline").status_code == 404
    assert client.post(f"/api/records/{demo_record}/timeline/analyze", json={"revision": 0}).status_code == 404


def test_fixture_never_applies_to_partially_matching_real_data(client):
    login(client)
    record = own_record(client, "Le dije que no. ¿Ya pensaste lo de la cena? Otro hecho ficticio.")
    state = analyze(client, record)
    assert state["mode"] == "extractive"
    descriptions = " ".join(event["description"] for event in state["events"])
    assert "sala 3" not in descriptions and "22:43" not in descriptions
    assert all(event["description"] in "Le dije que no. ¿Ya pensaste lo de la cena? Otro hecho ficticio."
               for event in state["events"])
    assert not any(item["kind"] != "unlinked_evidence" for item in state["review_items"])


def test_fixture_is_excluded_outside_demo_mode(client, demo_record, monkeypatch):
    from app.config import settings
    monkeypatch.setattr("app.timeline.settings", lambda: settings().model_copy(update={"demo_enabled": False}))
    login(client, MARIA)
    assert analyze(client, demo_record)["mode"] == "extractive"


def test_demo_seed_repairs_a_partially_created_case(store, monkeypatch):
    import app.files
    from sqlalchemy import select
    from app.db import SessionLocal
    from app.models import RecordFile
    from app.seed import seed_demo_case
    real = app.files.persist_file

    def failing(db, store, record_id, filename, data, meta):
        if filename == "correo_01.pdf":
            raise RuntimeError("almacenamiento caído")
        return real(db, store, record_id, filename, data, meta)
    monkeypatch.setattr(app.files, "persist_file", failing)
    with pytest.raises(RuntimeError):
        seed_demo_case()
    monkeypatch.setattr(app.files, "persist_file", real)
    record = seed_demo_case()
    seed_demo_case()
    with SessionLocal() as db:
        names = sorted(db.scalars(select(RecordFile.filename).where(RecordFile.record_id == record)))
    assert names == ["captura_01.png", "captura_02.png", "correo_01.pdf"]
