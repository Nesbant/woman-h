"""Backend added for the prototype redesign: profile, private note, overview, receipts, history, demo switch."""
import pytest
from app.main import app, config
from app.procedure import procedure_view
from app.seed import demo_id
from conftest import login

MARIA = "maria@example.test"
ANDINA = demo_id("Empresa Andina S.A.C.")
CONTENT = ("description", "date_kind", "event_date", "approximate_date")


def accept_all(client, record):
    state = client.post(f"/api/records/{record}/timeline/analyze", json={"revision": 0}).json()
    for event in state["events"]:
        state = client.put(f"/api/records/{record}/timeline/events/{event['id']}", json={
            **{key: event[key] for key in CONTENT}, "revision": state["revision"], "status": "accepted"}).json()
    return state


def test_profile_is_personal_and_editable(client, demo_record):
    login(client, MARIA)
    profile = client.get("/api/profile").json()
    assert profile["name"] == "María X." and profile["position"] == "Analista"
    assert profile["institution"] == {"id": ANDINA, "name": "Empresa Andina S.A.C."}
    updated = client.put("/api/profile", json={"institution_id": ANDINA, "document": "DNI •••• 4821",
                                               "contact": "maria.x@correo.pe", "position": "Analista senior",
                                               "area": "Operaciones", "relationship": None}).json()
    assert updated["position"] == "Analista senior" and updated["relationship"] is None
    assert client.put("/api/profile", json={"institution_id": "00000000-0000-0000-0000-000000000000"}).status_code == 404
    client.post("/api/auth/logout")
    login(client, "bea@example.test")
    assert client.get("/api/profile").json()["position"] is None


def test_overview_and_private_note_are_owner_only(client, demo_record):
    login(client, MARIA)
    overview = client.get(f"/api/records/{demo_record}/overview").json()
    assert overview["record"]["title"] == "Situación #001"
    assert overview["record"]["private_note"].startswith("Recordar preguntar a Lucía")
    assert overview["files"] == 3 and overview["timeline"]["processed"] is False
    assert overview["story"]["description"].startswith("A mediados de septiembre")
    accept_all(client, demo_record)
    overview = client.get(f"/api/records/{demo_record}/overview").json()
    assert overview["timeline"]["total"] == 3 and overview["timeline"]["accepted"] == 3 and overview["timeline"]["pending"] == 0
    assert client.put(f"/api/records/{demo_record}/note", json={"private_note": "Nota nueva"}).json() == {"private_note": "Nota nueva"}
    client.post("/api/auth/logout")
    for email in ("bea@example.test", "lucia@example.test"):
        login(client, email)
        assert client.get(f"/api/records/{demo_record}/overview").status_code == 404
        assert client.put(f"/api/records/{demo_record}/note", json={"private_note": "x"}).status_code == 404
        client.post("/api/auth/logout")


def test_submission_continues_andina_history_and_leaves_a_private_receipt(client, demo_record):
    login(client, MARIA)
    state = accept_all(client, demo_record)
    draft = client.post(f"/api/records/{demo_record}/complaint/generate", json={"revision": state["revision"]}).json()["draft"]
    draft = client.post(f"/api/records/{demo_record}/complaint/review", json={"revision": draft["revision"]}).json()["draft"]
    files = {item["filename"]: item["id"] for item in client.get(f"/api/records/{demo_record}/files").json()["items"]}
    response = client.post(f"/api/records/{demo_record}/submit", json={
        "draft_revision": draft["revision"], "event_ids": [fact["event_id"] for fact in draft["fields"]["facts"]["events"]],
        "file_ids": [files["captura_01.png"]], "institution_id": ANDINA})
    assert response.status_code == 201, response.text
    assert response.json()["case_id"] == "V-004"
    receipt = client.get(f"/api/records/{demo_record}/overview").json()["submissions"]
    assert receipt[0]["case_id"] == "V-004" and receipt[0]["summary"]["events"] == 3
    assert [item["filename"] for item in receipt[0]["summary"]["files"]] == ["captura_01.png"]
    client.post("/api/auth/logout")
    login(client, "lucia@example.test")
    listing = client.get(f"/api/institutions/{ANDINA}/cases").json()
    assert [item["case_id"] for item in listing["items"]] == ["V-004", "V-001", "V-002", "V-003"]
    assert listing["counts"] == {"received": 4, "new": 1, "in_review": 1, "follow_up": 1, "closed": 1}
    detail = client.get(f"/api/institutions/{ANDINA}/cases/V-004").json()
    assert detail["snapshot"]["summary"].startswith("Caso recibido con 3 eventos y 1 archivo")
    assert [event["title"] for event in detail["snapshot"]["facts"]["events"]][1] == "Mensajes recibidos fuera del horario laboral"
    history = client.get(f"/api/institutions/{ANDINA}/cases/V-002").json()
    assert [step["status"] for step in history["procedure"]][:5] == ["done", "done", "done", "done", "in_progress"]
    assert history["assignee"]["name"] == "Carlos M."


def test_demo_switch_only_in_demo_mode(client, demo_record, monkeypatch):
    assert client.post("/api/demo/switch", json={"view_as": "person"}).json()["name"] == "María X."
    org = client.post("/api/demo/switch", json={"view_as": "organization"}).json()
    assert org["name"] == "Lucía R." and org["memberships"][0]["institution_id"] == ANDINA
    assert client.get(f"/api/records/{demo_record}/overview").status_code == 404
    assert client.post("/api/demo/switch", json={"view_as": "admin"}).status_code == 422
    monkeypatch.setattr(config, "demo_enabled", False)
    assert client.post("/api/demo/switch", json={"view_as": "person"}).status_code == 404


def test_legacy_boolean_procedure_is_still_readable():
    steps = procedure_view({"rights_info": {"done": True, "done_at": "2026-09-25T10:00:00+00:00", "done_by": "u1"}})
    assert steps[0]["status"] == "done" and steps[0]["updated_by"] == "u1"
    assert steps[1]["status"] == "pending" and steps[1]["reference"] == "Ref. máx. 1 día hábil"
