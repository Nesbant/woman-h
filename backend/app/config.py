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
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=100 * 1024 * 1024)
    max_image_pixels: int = Field(default=25_000_000, ge=1, le=100_000_000)
    max_pdf_pages: int = Field(default=200, ge=1, le=1000)
    timeline_ai_factory: str = "app.timeline_ai:FixtureAdapter"
    timeline_ai_url: str | None = None
    timeline_ai_key: str | None = None

    @model_validator(mode="after")
    def validate_environment(self):
        project = Path(__file__).resolve().parents[2]
        if not self.storage_root.is_absolute():
            self.storage_root = project / self.storage_root
        self.storage_root = self.storage_root.resolve()
        if self.storage_root.is_relative_to(project / "frontend"):
            raise ValueError("El almacenamiento privado no puede estar dentro del frontend")
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
