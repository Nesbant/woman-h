from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from app.db import SessionLocal, engine
from app.main import app
from app.models import Account, PrivateRecord, StartEntry
from conftest import HEADERS, login


def payload():
    return {'entry_id': str(uuid4()), 'text': 'Relato ficticio iniciado desde Inicio.'}


def test_continue_creates_record_and_account_together_without_title_or_date(client):
    owner = login(client)
    data = payload()
    response = client.post('/api/start', json=data)
    assert response.status_code == 200
    saved = response.json()
    with SessionLocal() as db:
        record = db.get(PrivateRecord, saved['record_id'])
        account = db.get(Account, saved['account_id'])
        assert record.owner_id == owner['id'] and record.status == 'private_draft'
        assert record.title == 'Situación #001'
        assert record.description == account.description == data['text']
        assert account.record_id == record.id
        assert account.date_kind == 'unknown' and account.event_date is None
        assert account.place is None and account.mentioned_people is None
    assert client.get('/api/records').json()[0]['id'] == saved['record_id']
    assert client.get(f"/api/records/{saved['record_id']}/accounts").json()[0]['id'] == saved['account_id']
    client.post('/api/auth/logout')
    login(client)
    assert client.get(f"/api/records/{saved['record_id']}").json()['description'] == data['text']


def test_retries_update_same_objects_and_preserve_optional_fields(client):
    login(client)
    data = payload()
    saved = client.post('/api/start', json=data).json()
    assert client.post('/api/start', json=data).json() == saved
    client.put(f"/api/records/{saved['record_id']}", json={'title': 'Título elegido', 'description': data['text']})
    path = f"/api/records/{saved['record_id']}/accounts/{saved['account_id']}"
    client.put(path, json={'description':data['text'], 'date_kind':'exact', 'event_date':'2025-01-02', 'place':'Lugar ficticio'})
    assert client.post('/api/start', json={**data, 'text':'Texto ficticio corregido'}).json() == saved
    account = client.get(path).json()
    assert account['event_date'] == '2025-01-02' and account['place'] == 'Lugar ficticio'
    assert account['description'] == 'Texto ficticio corregido'
    assert client.get(f"/api/records/{saved['record_id']}").json()['title'] == 'Título elegido'
    with SessionLocal() as db:
        for model in [PrivateRecord, Account, StartEntry]:
            assert db.scalar(select(func.count()).select_from(model)) == 1


@pytest.mark.parametrize('email', ['bea@example.test', 'admin@example.test'])
def test_idempotency_key_does_not_grant_access_to_other_users(client, email):
    login(client)
    data = payload()
    saved = client.post('/api/start', json=data).json()
    login(client, email)
    other = client.post('/api/start', json={**data, 'text':'Texto de otra persona ficticia'}).json()
    assert other['record_id'] != saved['record_id']
    assert [row['id'] for row in client.get('/api/records').json()] == [other['record_id']]
    assert client.get(f"/api/records/{saved['record_id']}").status_code == 404
    assert client.get(f"/api/records/{saved['record_id']}/accounts/{saved['account_id']}").status_code == 404


def test_partial_failure_rolls_back_record(client, monkeypatch):
    login(client)
    def fail(*args, **kwargs):
        raise HTTPException(503, 'Fallo de prueba')
    monkeypatch.setattr('app.start.add_account', fail)
    assert client.post('/api/start', json=payload()).status_code == 503
    with SessionLocal() as db:
        for model in [PrivateRecord, Account, StartEntry]:
            assert db.scalar(select(func.count()).select_from(model)) == 0


def test_concurrent_retries_create_once(client):
    if engine.dialect.name != 'postgresql':
        pytest.skip('El bloqueo entre solicitudes se verifica con PostgreSQL')
    login(client)
    cookies = dict(client.cookies)
    data = payload()
    def submit():
        with TestClient(app, headers=HEADERS, cookies=cookies) as session:
            response = session.post('/api/start', json=data)
            assert response.status_code == 200
            return response.json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: submit(), range(2)))
    assert results[0] == results[1]
    assert len(client.get('/api/records').json()) == 1


def test_auth_csrf_validation_and_no_client_chosen_owner(client):
    assert client.post('/api/start', json=payload()).status_code == 401
    login(client)
    assert client.post('/api/start', json=payload(), headers={'Origin':'https://otro.test'}).status_code == 403
    for extra in [{'text':'  '}, {'text':'x'*10001}, {'entry_id':'no-es-uuid'}, {'owner_id':str(uuid4())}, {'record_id':str(uuid4())}]:
        assert client.post('/api/start', json={**payload(), **extra}).status_code == 422
    assert client.get('/api/records').json() == []


def test_voice_requires_explicit_review_and_reuses_existing_flow(client):
    login(client)
    data = {**payload(), 'source':'voice'}
    assert client.post('/api/start', json=data).status_code == 422
    assert client.post('/api/start', json={**data, 'reviewed':False}).status_code == 422
    assert client.get('/api/records').json() == []
    saved = client.post('/api/start', json={**data, 'reviewed':True})
    assert saved.status_code == 200
    result = saved.json()
    assert client.get(f"/api/records/{result['record_id']}/accounts/{result['account_id']}").json()['description'] == data['text']
    login(client, 'admin@example.test')
    assert client.get(f"/api/records/{result['record_id']}").status_code == 404
