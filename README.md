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

Diseño: basado en `VERA Prototipo.html`. En la pantalla de acceso, **Entrar como persona** abre la cuenta de María X. (solo con `DEMO_ENABLED=true`).

1. **Mi espacio**: *Situación #001* (relato, `captura_01.png`, `correo_01.pdf`, `captura_02.png` y una nota privada). → *Continuar*.
2. **Entender**: VERA propone 3 eventos con su fragmento de fuente y 3 avisos (fecha inconsistente, posible relación, evidencia no vinculada). Abre una fuente, confirma o corrige, *Usar 16 sep*.
3. **Preparar reporte**: seis secciones; la identidad detectada queda *pendiente* hasta que la confirmes (sin confirmar no se comparte); lo que falta queda a la vista.
4. **Revisar y compartir**: marca qué se envía y qué sigue privado → vista previa exacta → casilla de confirmación → *Confirmar y enviar* → **V-004**.
5. *Ver como la organización (demo)*: Lucía R. en **VERA Institutional** de Empresa Andina S.A.C. (V-001…V-003 ya existían): asignarse, estado, checklist Pendiente/En curso/Completado.

Para repetir la demo desde cero: `alembic downgrade base && alembic upgrade head && python -m app.seed`.

Pruebas: `cd backend && ../.venv/bin/python -m pytest -q` y `cd frontend && npm test && npm run build`. Recorrido completo en navegador: `npx playwright test` (con API, Vite y una carga ficticia recién hecha). Con `TEST_DATABASE_URL` (base terminada en `_test`) las pruebas corren sobre PostgreSQL; si no, sobre SQLite temporal.

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

| Correo | Rol |
| --- | --- |
| maria@example.test | Persona de la demo · *Situación #001* · perfil de Empresa Andina S.A.C. |
| lucia@example.test | Revisión en Empresa Andina S.A.C. (la organización de la demo) |
| andrea@example.test / carlos@example.test | Revisión / administración en Empresa Andina S.A.C. |
| ana@example.test, bea@example.test | Personas sin organización (pruebas de aislamiento) |
| revisora@example.test, admin@example.test, otra@example.test | Institución Aurora / Brisa (pruebas de aislamiento) |

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
- Módulos backend: `records`, `accounts`, `files`, `overview`, `profile`, `timeline` + `timeline_ai`, `complaints`, `institutional`, `procedure`.
- Frontend: `App.tsx` (sesión y shell), `views/` (Mi espacio, Registrar, Entender, Preparar, Compartir/Enviado, Institutional), `SourceDrawer.tsx`, `style.css` (tokens del prototipo).
