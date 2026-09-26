"""Turns the person's private material into citable fragments. Reads only; never interprets images."""
from datetime import date
from hashlib import sha256
import json
import re
import subprocess
import sys
from sqlalchemy import select
from .models import Account, PrivateRecord, RecordFile

MAX_ACCOUNTS = 30
MAX_ANALYZED_FILES = 5
MAX_SOURCES = 150
MAX_QUOTE = 2000
PDF_TIMEOUT_SECONDS = 5
SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+|[\r\n]+")
LITERAL_DATE = re.compile(r"\b(?:\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\b")
HEDGED = re.compile(r"aproxim|quizá|tal vez|no recuerdo|creo", re.I)
APPROXIMATE = re.compile(r"\b(?:a (?:principios|mediados|finales) de|aproximadamente en|alrededor de)\s+[^.;\n]{1,100}", re.I)


def unknown_date():
    return {"date_kind": "unknown", "event_date": None, "approximate_date": None}


def literal_date(text):
    """Only explicit, unambiguous dates. Relative dates are never resolved and nothing is completed."""
    candidates = LITERAL_DATE.findall(text)
    if len(candidates) == 1 and not HEDGED.search(text):
        value = candidates[0]
        try:
            exact = date.fromisoformat(value if '-' in value else '-'.join(reversed(value.split('/'))))
            return {"date_kind": "exact", "event_date": exact.isoformat(), "approximate_date": None}
        except ValueError:
            pass
    approx = APPROXIMATE.search(text)
    return {"date_kind": "approximate", "event_date": None, "approximate_date": approx.group(0)} if approx else unknown_date()


def description_version(text):
    return sha256((text or "").encode()).hexdigest()


def account_date(account):
    if account.date_kind == 'unknown':
        return None
    return {"date_kind": account.date_kind, "event_date": account.event_date.isoformat() if account.event_date else None,
            "approximate_date": account.approximate_date}


class Fragments:
    """Accumulates fragments and warnings while reading one record."""

    def __init__(self):
        self.sources, self.warnings = [], []

    def add(self, kind, identifier, label, text, version, page=None, explicit=None, field=None):
        for part in SENTENCE_BREAK.split(text):
            quote = part.strip()
            if not quote:
                continue
            if len(quote) > MAX_QUOTE:
                self.warnings.append(f"{label}: un fragmento supera 2000 caracteres; consúltalo en la fuente.")
                continue
            key = sha256(f"{kind}:{identifier}:{page}:{quote}".encode()).hexdigest()
            self.sources.append({"id": key, "kind": kind, "source_id": identifier, "label": label, "quote": quote,
                                 "page": page, "version": version, "field": field, "date": explicit or literal_date(quote)})

    def warn(self, message):
        self.warnings.append(message)


def read_accounts(db, record_id, fragments):
    accounts = db.scalars(select(Account).where(Account.record_id == str(record_id)).order_by(Account.created_at, Account.id)).all()
    for index, account in enumerate(accounts[:MAX_ACCOUNTS]):
        fragments.add("account", account.id, f"Relato {index + 1}", account.description,
                      account.updated_at.isoformat(), explicit=account_date(account))
    if len(accounts) > MAX_ACCOUNTS:
        fragments.warn("Se analizaron los primeros 30 relatos.")
    return bool(accounts)


def read_record_description(db, record_id, fragments):
    record = db.get(PrivateRecord, str(record_id))
    fragments.add("record", record.id, "Descripción inicial", record.description, record.updated_at.isoformat())


def extract_pdf_text(data):
    """PDF parsing runs in a bounded subprocess so a hostile file cannot stall or crash the API."""
    result = subprocess.run([sys.executable, '-m', 'app.pdf_text'], input=data, capture_output=True,
                            timeout=PDF_TIMEOUT_SECONDS, check=True)
    return json.loads(result.stdout)


def read_pdf(file, store, fragments):
    try:
        extracted = extract_pdf_text(store.read(file.original_key))
    except Exception:
        fragments.warn(f"{file.filename}: no pudo analizarse. El original sigue disponible en Archivos.")
        return
    if not extracted['pages']:
        fragments.warn(f"{file.filename}: no se encontró texto legible. Puedes continuar sin analizarlo.")
    for page in extracted['pages']:
        fragments.add("file", file.id, file.filename, page['text'], file.sha256, page['page'])
    if extracted['limited']:
        fragments.warn(f"{file.filename}: extracción parcial (máximo 10 páginas y 20 000 caracteres).")


def read_file(index, file, store, fragments):
    if file.description:
        # What the person wrote about the file is their own source; the image itself is never interpreted.
        fragments.add("file", file.id, f"{file.filename} · tu descripción", file.description,
                      description_version(file.description), field="description")
    if index >= MAX_ANALYZED_FILES:
        fragments.warn(f"{file.filename}: no analizado; límite de cinco archivos por procesamiento.")
    elif file.media_type == 'application/pdf':
        read_pdf(file, store, fragments)
    elif not file.description:
        fragments.warn(f"{file.filename}: no hay OCR de imágenes. Agrega una descripción para incluirla.")


def collect(db, record_id, store):
    """All citable fragments of a record, the warnings produced while reading, and its files."""
    fragments = Fragments()
    if not read_accounts(db, record_id, fragments):
        read_record_description(db, record_id, fragments)
    files = db.scalars(select(RecordFile).where(RecordFile.record_id == str(record_id)).order_by(RecordFile.created_at, RecordFile.id)).all()
    for index, file in enumerate(files):
        read_file(index, file, store, fragments)
    if len(fragments.sources) > MAX_SOURCES:
        fragments.warn("Se consideraron los primeros 150 fragmentos. Revisa también tus fuentes.")
    return fragments.sources[:MAX_SOURCES], fragments.warnings, files
