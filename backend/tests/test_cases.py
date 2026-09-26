"""SPEC Issue 7: the Private → Institutional boundary."""
import hashlib
import pytest
from sqlalchemy import select
from app.db import SessionLocal
from app.models import CaseFile, InstitutionalCase, RecordFile
from app.seed import demo_id
from conftest import login

AURORA = demo_id("Institución Aurora · ficticia")
BRISA = demo_id("Institución Brisa · ficticia")
CONTENT = ("description", "date_kind", "event_date", "approximate_date")


def accept_and_confirm(client, record):
    state = client.post(f"/api/records/{record}/timeline/analyze", json={"revision": 0}).json()
    for event in state["events"]:
        body = {key: event[key] for key in CONTENT}
        state = client.put(f"/api/records/{record}/timeline/events/{event['id']}",
                           json={**body, "revision": state["revision"], "status": "accepted"}).json()
    return client.post(f"/api/records/{record}/timeline/confirm", json={"revision": state["revision"]}).json()


def reviewed_draft(client, record):
    timeline = accept_and_confirm(client, record)
    draft = client.post(f"/api/records/{record}/complaint/generate", json={"revision": timeline["revision"]}).json()["draft"]
    return client.post(f"/api/records/{record}/complaint/review", json={"revision": draft["revision"]}).json()["draft"]


def files_by_name(client, record):
    return {item["filename"]: item for item in client.get(f"/api/records/{record}/files").json()["items"]}


def submit(client, record, draft, event_ids, file_ids, institution=AURORA):
    return client.post(f"/api/records/{record}/submit", json={
        "draft_revision": draft["revision"], "event_ids": event_ids, "file_ids": file_ids, "institution_id": institution})


@pytest.fixture
def submitted(client, demo_record):
    login(client)
    draft = reviewed_draft(client, demo_record)
    files = files_by_name(client, demo_record)
    events = [fact["event_id"] for fact in draft["fields"]["facts"]["events"]][:3]
    response = submit(client, demo_record, draft, events, [files["captura_01.png"]["id"], files["correo_01.pdf"]["id"]])
    assert response.status_code == 201, response.text
    client.post("/api/auth/logout")
    return {"record": demo_record, "draft": draft, "files": files, "events": events, "case": response.json()}


def test_draft_requires_confirmed_timeline_and_never_invents_missing_fields(client, demo_record):
    login(client)
    blocked = client.post(f"/api/records/{demo_record}/complaint/generate", json={"revision": 0})
    assert blocked.status_code == 422
    draft = reviewed_draft(client, demo_record)
    fields = draft["fields"]
    assert fields["affected"]["name"] == {"value": "Ana Demo", "origin": "profile"}
    assert fields["affected"]["position"]["value"] is None
    assert all(fields["respondent"][key]["value"] is None for key in ("name", "position", "area", "relationship"))
    assert fields["respondent"]["suggestions"] == ["Julio Ramírez (supervisor)"]
    assert fields["protection_measures"] == {"selected": [], "other": None}
    assert len(fields["facts"]["events"]) == 4
    assert "respondent.name" in draft["missing"] and "protection_measures" in draft["missing"]
    assert all(draft["source_map"][f"facts.{fact['event_id']}"] for fact in fields["facts"]["events"])


def test_person_edits_draft_and_edit_resets_review(client, demo_record):
    login(client)
    draft = reviewed_draft(client, demo_record)
    fact = draft["fields"]["facts"]["events"][0]
    body = {"revision": draft["revision"], "affected": {"position": {"value": "Analista"}},
            "respondent": {"name": {"value": "Julio Ramírez"}, "position": {"value": "Supervisor"}},
            "reporter_same_as_affected": True, "reporter_name": {"value": "Ana Demo"},
            "facts": [{"event_id": fact["event_id"], "description": "Reunión en la sala 3 (corregido)"}],
            "consequences": {"value": None}, "measures": ["no_contact_order"], "measures_other": None}
    response = client.put(f"/api/records/{demo_record}/complaint", json=body)
    assert response.status_code == 200, response.text
    edited = response.json()["draft"]
    assert edited["reviewed"] is False and edited["revision"] == draft["revision"] + 1
    assert edited["fields"]["respondent"]["name"] == {"value": "Julio Ramírez", "origin": "person"}
    assert edited["fields"]["affected"]["name"]["origin"] == "profile"
    assert edited["fields"]["facts"]["events"][0]["edited"] is True
    unknown = {**body, "revision": edited["revision"], "facts": [{"event_id": "no-existe", "description": "x"}]}
    assert client.put(f"/api/records/{demo_record}/complaint", json=unknown).status_code == 422
    stale = client.post(f"/api/records/{demo_record}/submit", json={
        "draft_revision": edited["revision"], "event_ids": [fact["event_id"]], "file_ids": [], "institution_id": AURORA})
    assert stale.status_code == 422  # edits must be reviewed again before sending


def test_submit_creates_case_with_only_selected_items_and_identical_hashes(client, submitted, store):
    case = submitted["case"]
    assert case["case_id"] == "V-001" and case["shared"] == {"events": 3, "files": 2}
    with SessionLocal() as db:
        row = db.scalar(select(InstitutionalCase).where(InstitutionalCase.case_id == "V-001"))
        copies = db.scalars(select(CaseFile).where(CaseFile.case_id == row.id)).all()
        originals = {f.id: f for f in db.scalars(select(RecordFile))}
        assert {c.filename for c in copies} == {"captura_01.png", "correo_01.pdf"}
        for copy in copies:
            original = originals[copy.source_file_id]
            assert copy.storage_key.startswith("cases/") and copy.storage_key != original.original_key
            assert hashlib.sha256(store.read(copy.storage_key)).hexdigest() == original.sha256 == copy.sha256
        snapshot = row.snapshot_json
    text = str(snapshot)
    assert submitted["record"] not in text and "captura_02.png" not in text
    assert "El martes 15" not in text  # relato stays private: no quotes travel
    assert len(snapshot["facts"]["events"]) == 3 and len(snapshot["evidence"]) == 2


def test_submit_rejects_foreign_items_and_other_owners(client, demo_record):
    login(client)
    draft = reviewed_draft(client, demo_record)
    events = [draft["fields"]["facts"]["events"][0]["event_id"]]
    assert submit(client, demo_record, draft, ["evt-inventado"], []).status_code == 422
    assert submit(client, demo_record, draft, events, ["00000000-0000-0000-0000-000000000000"]).status_code == 422
    assert submit(client, demo_record, {"revision": draft["revision"] + 5}, events, []).status_code == 409
    assert submit(client, demo_record, draft, events, [], "00000000-0000-0000-0000-000000000000").status_code == 404
    client.post("/api/auth/logout")
    login(client, "bea@example.test")
    assert submit(client, demo_record, draft, events, []).status_code == 404
    assert client.get(f"/api/records/{demo_record}/complaint").status_code == 404


@pytest.mark.parametrize("email", ["revisora@example.test", "admin@example.test"])
def test_institutional_cannot_list_count_or_open_private(client, demo_record, email):
    login(client)
    reviewed_draft(client, demo_record)  # private draft exists, nothing submitted
    client.post("/api/auth/logout")
    login(client, email)
    cases = client.get(f"/api/institutions/{AURORA}/cases").json()
    assert cases == {"counts": {"received": 0, "new": 0, "in_review": 0, "follow_up": 0, "closed": 0}, "items": []}
    assert client.get("/api/records").json() == []
    for path in ("", "/timeline", "/complaint", "/files", "/accounts"):
        assert client.get(f"/api/records/{demo_record}{path}").status_code == 404


def test_institution_sees_only_its_escalated_snapshot(client, submitted):
    login(client, "revisora@example.test")
    listing = client.get(f"/api/institutions/{AURORA}/cases").json()
    assert listing["counts"]["received"] == 1 and listing["items"][0]["status"] == "new"
    detail = client.get(f"/api/institutions/{AURORA}/cases/V-001").json()
    assert {item["filename"] for item in detail["files"]} == {"captura_01.png", "correo_01.pdf"}
    assert [step["key"] for step in detail["procedure"]] == [
        "rights_info", "medical_psych", "protection_measures", "committee_transfer",
        "investigation_report", "decision", "mtpe_communication"]
    download = client.get(f"/api/institutions/{AURORA}/cases/V-001/files/{detail['files'][0]['id']}/content")
    assert hashlib.sha256(download.content).hexdigest() == detail["files"][0]["sha256"]
    assert client.get(f"/api/records/{submitted['record']}").status_code == 404
    client.post("/api/auth/logout")
    login(client, "otra@example.test")
    assert client.get(f"/api/institutions/{AURORA}/cases").status_code == 403
    assert client.get(f"/api/institutions/{AURORA}/cases/V-001").status_code == 403
    assert client.get(f"/api/institutions/{BRISA}/cases/V-001").status_code == 404


def test_case_management_never_changes_snapshot(client, submitted):
    reviewer = login(client, "revisora@example.test")
    base = f"/api/institutions/{AURORA}/cases/V-001"
    before = client.get(base).json()["snapshot"]
    assert client.put(f"{base}/assignee", json={"assignee_id": reviewer["id"]}).json()["assignee"]["name"] == "Lucía Demo"
    assert client.put(f"{base}/assignee", json={"assignee_id": demo_id("ana@example.test")}).status_code == 422
    assert client.put(f"{base}/status", json={"status": "in_review"}).json()["status"] == "in_review"
    assert client.put(f"{base}/status", json={"status": "culpable"}).status_code == 422
    step = client.put(f"{base}/procedure/rights_info", json={"done": True}).json()["procedure"][0]
    assert step["done"] is True and step["done_by"]["name"] == "Lucía Demo"
    assert client.put(f"{base}/procedure/sancion", json={"done": True}).status_code == 422
    assert client.get(base).json()["snapshot"] == before


def test_editing_private_after_submit_does_not_modify_snapshot(client, submitted):
    record, draft = submitted["record"], submitted["draft"]
    login(client, "revisora@example.test")
    before = client.get(f"/api/institutions/{AURORA}/cases/V-001").json()["snapshot"]
    client.post("/api/auth/logout")
    login(client)
    client.put(f"/api/records/{record}", json={"title": "Cambiado", "description": "Texto privado nuevo"})
    body = {"revision": draft["revision"], "affected": {"name": {"value": "Otro nombre"}}, "respondent": {},
            "reporter_same_as_affected": True, "reporter_name": {"value": "Ana Demo"}, "facts": [],
            "consequences": {"value": "Nueva consecuencia"}, "measures": [], "measures_other": None}
    assert client.put(f"/api/records/{record}/complaint", json=body).status_code == 200
    first_file = submitted["files"]["captura_01.png"]["id"]
    assert client.delete(f"/api/records/{record}/files/{first_file}").status_code == 204
    client.post("/api/auth/logout")
    login(client, "revisora@example.test")
    after = client.get(f"/api/institutions/{AURORA}/cases/V-001").json()
    assert after["snapshot"] == before
    copy = next(item for item in after["files"] if item["filename"] == "captura_01.png")
    assert client.get(f"/api/institutions/{AURORA}/cases/V-001/files/{copy['id']}/content").status_code == 200


def test_case_numbers_are_sequential_per_institution(client, demo_record):
    login(client)
    draft = reviewed_draft(client, demo_record)
    events = [draft["fields"]["facts"]["events"][0]["event_id"]]
    assert submit(client, demo_record, draft, events, []).json()["case_id"] == "V-001"
    assert submit(client, demo_record, draft, events, []).json()["case_id"] == "V-002"
    assert submit(client, demo_record, draft, events, [], BRISA).json()["case_id"] == "V-001"


def test_submit_rejects_draft_made_from_an_outdated_timeline(client, demo_record):
    login(client)
    draft = reviewed_draft(client, demo_record)
    timeline = client.get(f"/api/records/{demo_record}/timeline").json()
    event = timeline["events"][0]
    changed = client.put(f"/api/records/{demo_record}/timeline/events/{event['id']}", json={
        **{key: event[key] for key in CONTENT}, "revision": timeline["revision"], "status": "discarded"})
    assert changed.status_code == 200
    assert client.get(f"/api/records/{demo_record}/complaint").json()["draft"]["stale"] is True
    response = submit(client, demo_record, draft, [event["id"]], [])
    assert response.status_code == 409
    with SessionLocal() as db:
        assert db.scalar(select(InstitutionalCase)) is None
