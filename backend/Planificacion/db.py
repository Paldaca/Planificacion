"""
Base de datos de Planificación (propia; nunca la del Portal).

Prioridad (patrón Nómina / auditoría A-02):

1. ``DATABASE_URL`` — producción y Docker/Coolify
   (``mysql://usuario:clave@host:3306/planificacion``).
2. ``MYSQL_*`` — desarrollo local contra MySQL.
3. Sin ninguna de las dos y fuera del contenedor — SQLite
   (``backend/db.sqlite3``), solo para arranque rápido en local.

Con ``RUNNING_IN_DOCKER=1`` hace falta ``DATABASE_URL``: un SQLite dentro
de la imagen se perdería en cada despliegue.
"""

from __future__ import annotations

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
MYSQL_ENGINE = "django.db.backends.mysql"


def _bool_env(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _normalize_mysql_host(host: str | None) -> str:
    """MySQLdb en Linux usa socket Unix si HOST es ``localhost``."""
    value = (host or "").strip()
    if value.lower() == "localhost":
        return "127.0.0.1"
    return value or "127.0.0.1"


def _mysql_options() -> dict:
    return {
        "charset": "utf8mb4",
        "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
    }


def _apply_mysql_options(db_settings: dict) -> None:
    if db_settings.get("ENGINE") != MYSQL_ENGINE:
        return
    options = db_settings.setdefault("OPTIONS", {})
    for key, value in _mysql_options().items():
        options.setdefault(key, value)
    db_settings.setdefault("CONN_MAX_AGE", 600)
    db_settings.setdefault("CONN_HEALTH_CHECKS", True)
    if "HOST" in db_settings:
        db_settings["HOST"] = _normalize_mysql_host(db_settings.get("HOST"))


def _sqlite_config() -> dict:
    return {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


def _mysql_from_env() -> dict:
    return {
        "default": {
            "ENGINE": MYSQL_ENGINE,
            "NAME": os.getenv("MYSQL_DB", "planificacion_db"),
            "USER": os.getenv("MYSQL_USER", "RAG"),
            "PASSWORD": os.getenv("MYSQL_PASSWORD", "12345"),
            "HOST": _normalize_mysql_host(os.getenv("MYSQL_HOST", "localhost")),
            "PORT": os.getenv("MYSQL_PORT", "3306"),
            "OPTIONS": _mysql_options(),
            "CONN_MAX_AGE": 600,
            "CONN_HEALTH_CHECKS": True,
        }
    }


def _parse_database_url(database_url: str) -> dict:
    import dj_database_url

    config = dj_database_url.parse(
        database_url,
        conn_max_age=600,
        conn_health_checks=True,
    )
    _apply_mysql_options(config)
    return {"default": config}


def get_databases() -> dict:
    """
    Docker/producción: ``DATABASE_URL`` obligatoria.
    Local: ``MYSQL_*`` si hay ``MYSQL_DB``; si no, SQLite.
    """
    database_url = os.getenv("DATABASE_URL", "").strip()
    docker = _bool_env("RUNNING_IN_DOCKER", "false")

    if docker and not database_url:
        raise ImproperlyConfigured(
            "DATABASE_URL es obligatoria en el contenedor: "
            "mysql://usuario:clave@host:3306/planificacion"
        )

    if database_url:
        return _parse_database_url(database_url)

    if os.getenv("MYSQL_DB", "").strip():
        return _mysql_from_env()

    return _sqlite_config()


def usa_bd_servidor(databases: dict | None = None) -> bool:
    """True si la BD por defecto no es SQLite (caché compartida, etc.)."""
    dbs = databases if databases is not None else get_databases()
    engine = dbs.get("default", {}).get("ENGINE", "")
    return engine != "django.db.backends.sqlite3"
