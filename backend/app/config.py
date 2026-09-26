from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore"
    )
    app_env: Literal["development", "test", "production"] = "development"
    database_url: str
    allowed_origins: list[str] = ["http://localhost:5173"]
    cookie_secure: bool = False
    session_hours: int = Field(default=8, ge=1, le=24)
    demo_enabled: bool = False
    # Showcase: the login's "Entrar como persona/organización" buttons sign in as the seeded accounts
    # (SEED_MARIA_EMAIL / SEED_REVIEWER_EMAIL) without a password. Allowed in production, unlike demo mode:
    # it never creates the fictional demo users. Only for a deployment meant for synthetic-data testing.
    showcase_enabled: bool = False
    demo_password: str | None = None
    storage_factory: str = "app.storage:LocalStorage"
    storage_root: Path = Path(__file__).resolve().parents[2] / ".private-storage"
    # Built SPA (`frontend/dist`, produced by `npm run build`). When present, `main.py` serves it from the same
    # origin as `/api/*` (Railway option A: one web service); when absent, local dev is unchanged (Vite serves it).
    frontend_dist: Path = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=100 * 1024 * 1024)
    max_image_pixels: int = Field(default=25_000_000, ge=1, le=100_000_000)
    max_pdf_pages: int = Field(default=200, ge=1, le=1000)
    timeline_ai_factory: str = "app.timeline_ai:FixtureAdapter"
    timeline_ai_url: str | None = None
    timeline_ai_key: str | None = None
    # `timeline_ai:OpenRouterTimelineAdapter`'s primary model; defaults to `chat_model` (same provider account,
    # same `chat_fallback_models`/timeout/provider routing as the chat brain) so a deployment that only sets
    # `CHAT_MODEL` gets a working timeline adapter too, without a second model choice to keep in sync.
    timeline_model: str | None = None
    # EST-04 (epic #5): which `AgentBrain` answers the conversation. `scripted` is the only one that exists
    # yet (`agent/scripted.py`); `openrouter` is EST-05's real provider brain, added without changing this
    # default.
    chat_brain: Literal["scripted", "openrouter"] = "scripted"
    # EST-05 (issue #11, revised 2026-09-26 — user decision: OpenRouter replaces Anthropic as the provider,
    # see `agent/openrouter.py`). OpenRouter's OpenAI-compatible Chat Completions API, one Bearer key for many
    # providers/models. `chat_model` is the primary model; `chat_fallback_models` feeds OpenRouter's own
    # `models` array so it tries the next one if the primary provider is unavailable. Both defaults verified
    # on 2026-09-26 in OpenRouter's public model list as supporting `tools` + `structured_outputs`:
    # `google/gemini-3.1-flash-lite` ($0.25/$1.50 per 1M tokens in/out) is fast and cheap enough for a
    # chat/tool-calling workload (short replies, a handful of small tool calls a turn, never long-horizon
    # agentic work); `deepseek/deepseek-v4-flash` ($0.047/$0.094 per 1M) is the cheaper fallback. No key means
    # `OpenRouterBrain` never even tries the network; the turn orchestrator (`agent/turn.py`) falls back to
    # `ScriptedBrain` for that turn instead of failing the request.
    openrouter_api_key: str | None = None
    chat_model: str = "google/gemini-3.1-flash-lite"
    chat_fallback_models: list[str] = Field(default_factory=lambda: ["deepseek/deepseek-v4-flash"])
    openrouter_base_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_timeout_seconds: float = Field(default=30.0, ge=1.0, le=120.0)
    # Optional identification headers OpenRouter's own docs ask for (`HTTP-Referer`/`X-Title`, used only for
    # OpenRouter's own app-ranking pages) — never required, never sent when unset.
    openrouter_http_referer: str | None = None
    openrouter_x_title: str | None = None
    # `python -m app.seed_production` (idempotent, safe on every deploy): creates up to three real accounts
    # from these variables — María's fully prepared showcase case, Lucía's reviewer account at Empresa Andina,
    # and a plain real-use account with no seeded data. Any account whose email/password pair is missing is
    # skipped; an existing account's password and data are never touched on a later run.
    seed_maria_email: str | None = None
    seed_maria_password: str | None = None
    seed_reviewer_email: str | None = None
    seed_reviewer_password: str | None = None
    seed_user_email: str | None = None
    seed_user_password: str | None = None
    seed_user_name: str | None = None
    # Runs `seed_production.run()` once at application startup instead of (or in addition to) Railway's
    # `preDeployCommand` — see odd/tasks/railway-deploy.md for why a mounted volume may need this.
    seed_on_start: bool = False

    @model_validator(mode="after")
    def validate_environment(self):
        project = Path(__file__).resolve().parents[2]
        if not self.storage_root.is_absolute():
            self.storage_root = project / self.storage_root
        self.storage_root = self.storage_root.resolve()
        if self.storage_root.is_relative_to(project / "frontend"):
            raise ValueError("El almacenamiento privado no puede estar dentro del frontend")
        if not self.frontend_dist.is_absolute():
            self.frontend_dist = project / self.frontend_dist
        self.frontend_dist = self.frontend_dist.resolve()
        # Railway's own `DATABASE_URL` reference (and Postgres tooling in general) uses the plain `postgresql://`
        # scheme; SQLAlchemy needs the `+psycopg` driver suffix to pick psycopg3. Normalized here so a Railway
        # variable reference can be pasted in verbatim instead of requiring a hand-edited scheme.
        if self.database_url.startswith("postgresql://"):
            self.database_url = "postgresql+psycopg://" + self.database_url[len("postgresql://"):]
        if self.app_env != "test" and not self.database_url.startswith("postgresql+psycopg://"):
            raise ValueError("VERA requiere PostgreSQL fuera de las pruebas")
        if "*" in self.allowed_origins:
            raise ValueError("Especifica orígenes explícitos")
        if self.app_env == "production" and (not self.cookie_secure or self.demo_enabled
                or any(not origin.startswith("https://") for origin in self.allowed_origins)):
            raise ValueError("Producción requiere HTTPS, cookies seguras y demostración desactivada")
        return self


@lru_cache
def settings():
    return Settings()
