"""CRUD completeness: deleting a situation (decision D1) and events the person adds themselves (D2)."""
import hashlib
from sqlalchemy import func, select
from app.db import SessionLocal
from app.models import Account, CaseFile, ComplaintDraft, PrivateRecord, RecordFile, RecordSubmission, Timeline
from app.seed import demo_id
from conftest import login

MARIA = "maria@example.test"
ANDINA = demo_id("Empresa Andina S.A.C.")
CONTENT = ("description", "date_kind", "event_date", "approximate_date")


def analyze(client, record):
    return client.post(f"/api/records/{record}/timeline/analyze", json={"revision": 0}).json()


def send_first_event(client, record):
    state = analyze(client, record)
    event = state["events"][1]
    state = client.put(f"/api/records/{record}/timeline/events/{event['id']}", json={
        **{key: event[key] for key in CONTENT}, "revision": state["revision"], "status": "accepted"}).json()
    draft = client.post(f"/api/records/{record}/complaint/generate", json={"revision": state["revision"]}).json()["draft"]
    draft = client.post(f"/api/records/{record}/complaint/review", json={"revision": draft["revision"]}).json()["draft"]
    files = {f["filename"]: f["id"] for f in client.get(f"/api/records/{record}/files").json()["items"]}
    response = client.post(f"/api/records/{record}/submit", json={"draft_revision": draft["revision"], "event_ids": [event["id"]],
                                                                  "file_ids": [files["captura_01.png"]], "institution_id": ANDINA})
    assert response.status_code == 201, response.text
    return response.json()["case_id"]


def count(db, model, **where):
    query = select(func.count()).select_from(model)
    for column, value in where.items():
        query = query.where(getattr(model, column) == value)
    return db.scalar(query)


def test_deleting_a_situation_removes_everything_private(client, demo_record, store):
    login(client, MARIA)
    case_id = send_first_event(client, demo_record)
    with SessionLocal() as db:
        keys = [key for f in db.scalars(select(RecordFile).where(RecordFile.record_id == demo_record)) for key in (f.original_key, f.preview_key)]
    assert keys and all(store.read(key) for key in keys)
    assert client.delete(f"/api/records/{demo_record}").status_code == 204
    assert client.get(f"/api/records/{demo_record}/overview").status_code == 404
    # María also owns a second, separate seeded case (EST-07's conversation record) that this delete must
    # never touch — so this only asserts the deleted one is gone, not that the list is now empty.
    assert demo_record not in [r["id"] for r in client.get("/api/records").json()]
    with SessionLocal() as db:
        for model in (Account, RecordFile, Timeline, ComplaintDraft, RecordSubmission):
            assert count(db, model, record_id=demo_record) == 0, model.__name__
        assert db.get(PrivateRecord, demo_record) is None
    for key in keys:
        try:
            store.read(key)
            raise AssertionError(f"{key} sigue guardado")
        except FileNotFoundError:
            pass
    client.post("/api/auth/logout")
    login(client, "lucia@example.test")
    detail = client.get(f"/api/institutions/{ANDINA}/cases/{case_id}").json()
    assert detail["snapshot"]["facts"]["events"][0]["title"] == "Mensajes recibidos fuera del horario laboral"
    copy = detail["files"][0]
    content = client.get(f"/api/institutions/{ANDINA}/cases/{case_id}/files/{copy['id']}/content")
    assert content.status_code == 200 and hashlib.sha256(content.content).hexdigest() == copy["sha256"]
    with SessionLocal() as db:
        assert count(db, CaseFile) >= 1


def test_only_the_owner_can_delete_a_situation(client, demo_record):
    for email in ("bea@example.test", "lucia@example.test"):
        login(client, email)
        assert client.delete(f"/api/records/{demo_record}").status_code == 404
        client.post("/api/auth/logout")
    with SessionLocal() as db:
        assert db.get(PrivateRecord, demo_record) is not None


def test_person_can_add_edit_and_delete_their_own_events(client, demo_record):
    login(client, MARIA)
    before_analysis = client.post(f"/api/records/{demo_record}/timeline/events", json={
        "revision": 0, "title": "x", "description": "x", "date_kind": "unknown"})
    assert before_analysis.status_code == 409
    state = analyze(client, demo_record)
    added = client.post(f"/api/records/{demo_record}/timeline/events", json={
        "revision": state["revision"], "title": "Cambio de escritorio", "description": "Me movieron de escritorio sin aviso.",
        "date_kind": "exact", "event_date": "2026-09-19"})
    assert added.status_code == 201, added.text
    state = added.json()
    event = state["events"][-1]
    assert event["status"] == "accepted" and event["source"]["label"] == "Agregado por ti" and event["mode"] == "person"
    assert event["event_date"] == "2026-09-19"
    invalid = client.post(f"/api/records/{demo_record}/timeline/events", json={
        "revision": state["revision"], "title": "Mala", "description": "Fecha inconsistente", "date_kind": "exact"})
    assert invalid.status_code == 422
    edited = client.put(f"/api/records/{demo_record}/timeline/events/{event['id']}", json={
        "revision": state["revision"], "status": "accepted", "title": "Cambio de escritorio sin aviso",
        "description": "Me movieron de escritorio.", "date_kind": "approximate", "event_date": None, "approximate_date": "fines de septiembre"}).json()
    changed = next(e for e in edited["events"] if e["id"] == event["id"])
    assert changed["title"] == "Cambio de escritorio sin aviso" and changed["approximate_date"] == "fines de septiembre"
    assert changed["source"]["quote"] == "Me movieron de escritorio."
    source = client.get(f"/api/records/{demo_record}/timeline/events/{event['id']}/source").json()
    assert source["current_text"] == "Me movieron de escritorio." and source["changed"] is False
    draft = client.post(f"/api/records/{demo_record}/complaint/generate", json={"revision": edited["revision"]}).json()["draft"]
    fact = next(f for f in draft["fields"]["facts"]["events"] if f["event_id"] == event["id"])
    assert fact["sources"] == [{"kind": "person", "source_id": event["id"], "label": "Agregado por ti"}]
    removed = client.delete(f"/api/records/{demo_record}/timeline/events/{event['id']}", params={"revision": edited["revision"]})
    assert removed.status_code == 200 and event["id"] not in [e["id"] for e in removed.json()["events"]]
    assert client.get(f"/api/records/{demo_record}/complaint").json()["draft"]["stale"] is True


def test_vera_proposals_are_discarded_not_deleted(client, demo_record):
    login(client, MARIA)
    state = analyze(client, demo_record)
    proposal = state["events"][0]
    response = client.delete(f"/api/records/{demo_record}/timeline/events/{proposal['id']}", params={"revision": state["revision"]})
    assert response.status_code == 422
    assert proposal["id"] in [e["id"] for e in client.get(f"/api/records/{demo_record}/timeline").json()["events"]]
    stale = client.delete(f"/api/records/{demo_record}/timeline/events/{proposal['id']}", params={"revision": 0})
    assert stale.status_code == 409


def test_manual_event_is_labelled_as_the_persons_statement_in_the_snapshot(client, demo_record):
    login(client, MARIA)
    state = analyze(client, demo_record)
    state = client.post(f"/api/records/{demo_record}/timeline/events", json={
        "revision": state["revision"], "title": "Aviso a RR. HH.", "description": "Comenté lo ocurrido a una compañera.",
        "date_kind": "unknown"}).json()
    manual = state["events"][-1]
    draft = client.post(f"/api/records/{demo_record}/complaint/generate", json={"revision": state["revision"]}).json()["draft"]
    draft = client.post(f"/api/records/{demo_record}/complaint/review", json={"revision": draft["revision"]}).json()["draft"]
    case = client.post(f"/api/records/{demo_record}/submit", json={"draft_revision": draft["revision"], "event_ids": [manual["id"]],
                                                                  "file_ids": [], "institution_id": ANDINA}).json()
    client.post("/api/auth/logout")
    login(client, "lucia@example.test")
    fact = client.get(f"/api/institutions/{ANDINA}/cases/{case['case_id']}").json()["snapshot"]["facts"]["events"][0]
    assert fact["title"] == "Aviso a RR. HH." and fact["sources"] == ["Declaración de la persona"]
