"""Contrato privado: bytes y claves internas; nunca URLs ni nombres proporcionados por clientes."""
from functools import lru_cache
from importlib import import_module
from pathlib import Path
import re
from typing import Protocol
from .config import Settings, settings


class PrivateStorage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def read(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, config: Settings):
        self.root = config.storage_root.resolve()

    def path(self, key: str) -> Path:
        if not re.fullmatch(r"(?:originals|previews|cases)/[a-f0-9]{32}", key):
            raise ValueError("Clave de almacenamiento inválida")
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("La ruta sale del almacenamiento privado")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Clave nueva y exclusiva: jamás sobrescribir un original.
        try:
            with path.open("xb") as output:
                output.write(data)
        except FileExistsError:
            raise
        except OSError:
            path.unlink(missing_ok=True)
            raise

    def read(self, key: str) -> bytes:
        return self.path(key).read_bytes()

    def delete(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)


@lru_cache
def get_storage() -> PrivateStorage:
    module, name = settings().storage_factory.split(":", 1)
    return getattr(import_module(module), name)(settings())
