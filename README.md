# VERA

VERA ayuda a una persona a convertir hechos y evidencia dispersa en una historia estructurada y revisable dentro de un espacio privado. La IA organiza y relaciona la información, pero la persona mantiene el control. Solo cuando decide escalar, selecciona qué compartir y la organización recibe un expediente estructurado para iniciar su procedimiento.

Vertical del MVP: hostigamiento sexual laboral en organizaciones privadas en Perú. **Alcance, reglas y contratos: [SPEC.md](SPEC.md)** (fuente de verdad del producto).

> El prototipo demuestra aislamiento entre usuarios, revisión humana de la IA, integridad mediante hashes y un handoff explícito entre Private e Institutional. **No** es zero-access: la infraestructura actual almacena la información de forma legible.

## Stack

- Frontend: React + TypeScript + Vite (Vitest, Playwright)
- Backend: FastAPI + SQLAlchemy + Alembic (pytest)
- Base de datos: PostgreSQL 17
- Almacenamiento: abstracción privada (`app.storage`), local por defecto
- CI: GitHub Actions (`.github/workflows/checks.yml`)

## Cómo levantarlo

Requisitos: Python 3.12+, Node 22.12+ y Docker Compose (o PostgreSQL propio). Desde la raíz (macOS/Linux; en PowerShell usar `.venv\Scripts\python.exe`, `Copy-Item` y `npm.cmd`):

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
docker compose up -d --wait db
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock.txt
cd backend
../.venv/bin/python -m alembic upgrade head
../.venv/bin/python -m app.seed        # cuentas + situación ficticia de Ana (idempotente)
../.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

En otra terminal: `cd frontend && npm ci && npm run dev`, y abrir **http://localhost:5173** (usar `localhost`, no `127.0.0.1`).

### Demo (≈2 minutos)

1. Entrar como `ana@example.test` → **Mis registros** → *Situación #001* (relato, `captura_01.png`, `correo_01.pdf`, `captura_02.png`).
2. **Entender lo ocurrido** → *Proponer cronología*: 4 eventos con fuentes y avisos (fecha inconsistente, posible relación, evidencia no vinculada).
3. Ver una fuente, corregir/aceptar eventos y **confirmar la cronología**.
4. **Preparar reporte**: seis secciones; lo faltante queda marcado, nunca inventado.
5. **Revisar y compartir**: marcar/desmarcar qué se envía → *Revisar lo que verá la organización* → *Confirmar y enviar* → `V-001`.
6. Cerrar sesión, entrar como `revisora@example.test` → **VERA Institutional**: lista, detalle, responsable, estado y checklist del procedimiento.

Pruebas: `cd backend && ../.venv/bin/python -m pytest -q` y `cd frontend && npm test && npm run build`. Con `TEST_DATABASE_URL` (base terminada en `_test`) las pruebas corren sobre PostgreSQL; si no, sobre SQLite temporal.

## Variables necesarias

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://...`; obligatoria |
| `APP_ENV` | `development`, `test` o `production` |
| `ALLOWED_ORIGINS` | Lista JSON de orígenes explícitos (CORS y CSRF) |
| `COOKIE_SECURE` | `false` solo en desarrollo HTTP |
| `SESSION_HOURS` | Duración de sesión, 1–24 h (defecto 8) |
| `DEMO_ENABLED` / `DEMO_PASSWORD` | Carga ficticia; contraseña de 16+ caracteres |
| `STORAGE_FACTORY` / `STORAGE_ROOT` | Almacenamiento privado (fuera de `frontend/`) |
| `MAX_UPLOAD_BYTES`, `MAX_IMAGE_PIXELS`, `MAX_PDF_PAGES` | Límites de archivos |
| `TIMELINE_AI_FACTORY` | `app.timeline_ai:FixtureAdapter` (defecto) o `app.timeline_ai:HttpAdapter` |
| `TIMELINE_AI_URL` / `TIMELINE_AI_KEY` | Endpoint HTTPS del proveedor para `HttpAdapter` |
| `API_PROXY_TARGET` | En `frontend/.env`: destino del proxy de Vite |

**Fallback de IA:** siempre se intenta *adaptador configurado → `backend/app/demo_fixture.json` → selección extractiva*. Todo lo propuesto se verifica en el servidor: cada evento debe citar fuentes existentes con citas literales; fechas exactas sin respaldo quedan "pendientes de confirmar"; puntajes, culpabilidad, credibilidad o sanciones se descartan.

## Cuentas demo

Contraseña: el valor de `DEMO_PASSWORD` (ejemplo: `Vera-Ficticia-2026!`). Todos los datos son ficticios.

| Correo | Acceso institucional |
| --- | --- |
| ana@example.test | Ninguno · tiene la *Situación #001* |
| bea@example.test | Ninguno |
| revisora@example.test | Revisión en Institución Aurora |
| admin@example.test | Administración en Institución Aurora |
| otra@example.test | Revisión en Institución Brisa |

## Arquitectura general

```text
PRIVATE (solo la persona dueña)
  PrivateRecord · Account (relatos) · RecordFile (SHA-256) · Timeline · ComplaintDraft
        │
        │  único puente: POST /api/records/{id}/submit
        │  (eventos y archivos elegidos, revisión del borrador)
        ▼
SNAPSHOT INSTITUCIONAL
  InstitutionalCase (case_id V-NNN, JSON congelado, sin referencia al registro privado)
  CaseFile (copia bajo cases/, mismo SHA-256)
        ▼
INSTITUTIONAL (miembros de la organización)
  lista · detalle · estado · responsable · checklist regulatorio
```

- Institutional no puede listar, contar ni abrir registros privados; editar Private después del envío no modifica el snapshot.
- Sesiones opacas en cookie `HttpOnly` + `SameSite=strict`, revocables; la base guarda solo su SHA-256.
- Módulos backend: `records`, `accounts`, `files`, `timeline` + `timeline_ai`, `complaints`, `institutional`, `procedure`.
