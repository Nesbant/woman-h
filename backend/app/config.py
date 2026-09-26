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
    # EST-04 (epic #5): which `AgentBrain` answers the conversation. `scripted` is the only one that exists
    # yet (`agent/scripted.py`); `claude` is EST-05's real provider brain, added without changing this default.
    chat_brain: Literal["scripted", "claude"] = "scripted"
    # EST-05 (issue #11): `agent/llm.py::ClaudeBrain`. `claude-sonnet-5` is the current-generation, cost-
    # efficient model for a conversational tool-calling workload like this one (per the Anthropic API
    # guidance: chat/classification-shaped work rarely benefits from an Opus-tier model, and one model per
    # deployment keeps prompt caching effective — a cascade of models forfeits cache reuse across them). The
    # issue's `claude-opus-5` guess is not a real model id and `chat_effort` defaults to `"low"` for the same
    # reason (chat replies over a handful of small tool calls, not long-horizon agentic work). No key means
    # `ClaudeBrain` never even tries the network; the turn orchestrator (`agent/turn.py`) falls back to
    # `ScriptedBrain` for that turn instead of failing the request.
    anthropic_api_key: str | None = None
    chat_model: str = "claude-sonnet-5"
    chat_effort: Literal["low", "medium", "high", "xhigh", "max"] = "low"

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
