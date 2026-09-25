"""
Django settings for Planificacion project.

Planificación es un satélite FEDERADO de PALDACA Suite (ver
`Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md`): base de datos
propia, `SECRET_KEY` propia, identidad resuelta vía cookie-forwarding contra
`GET /api/auth/me/` del Portal — nunca comparte `core_*` ni la cookie de
sesión del Portal. Backend API-only (DRF); el frontend es una SPA React
separada (`frontend/`) que consume esta API y habla el protocolo
`paldaca-embed` v1 para vivir dentro del iframe del shell del Portal.

`DEBUG` se deriva SIEMPRE de la variable de entorno `DJANGO_DEBUG` — nunca
hardcodeado. El propio Portal-Paldaca (y, hasta hace poco, Calidad/Códigos)
tienen/tuvieron `DEBUG=True` hardcodeado en producción, documentado como
riesgo en `IA_CONTEXT.md` §13; no se repite ese error aquí.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def _bool_env(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# --- Núcleo -------------------------------------------------------------

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-planificacion-dev-only-cambiar-en-produccion",
)
DEBUG = _bool_env("DJANGO_DEBUG", "true")
ALLOWED_HOSTS = _csv_env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")


# --- Apps / middleware ----------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "core",
    "paldaca_sso",
    "integracion_portal",
    "equipos",
    "calendario",
    "tableros",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # Después de AuthenticationMiddleware (necesita request.user) y ANTES del
    # middleware SSO (que puede cortocircuitar la petición y necesita
    # request.paldaca_embedded ya puesto). Su fase de respuesta corre después
    # de todos los de abajo, así que tiene la última palabra sobre las
    # cabeceras de framing.
    "paldaca_sso.embed.PaldacaEmbedMiddleware",
    # Bootstrap de sesión local a partir de la cookie del Portal. Con
    # PALDACA_SSO_ENABLED=false (default) no hace nada — deploy dark.
    "paldaca_sso.middleware.PaldacaSsoBootstrapMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    # SIN XFrameOptionsMiddleware: el framing lo controla exclusivamente
    # PaldacaEmbedMiddleware con CSP frame-ancestors (admite lista de
    # orígenes; X-Frame-Options no). Reponerlo rompe el embed en silencio.
]

ROOT_URLCONF = "Planificacion.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "Planificacion.wsgi.application"


# --- Base de datos ----------------------------------------------------

# SQLite por defecto (fase de scaffold, sin datos de negocio todavía). Migrar
# a MySQL propio (nunca la instancia del Portal) antes de manejar planes
# reales — ver DATABASE_URL/MYSQL_* en los satélites federados existentes
# (Nomina Paldaca/Nomina/env.py) para el patrón a seguir.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# --- Password validation ------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTH_USER_MODEL = "core.UsuarioPaldaca"

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    # Al final: solo la usa paldaca_sso.middleware para que login() tenga una
    # ruta de backend válida tras el bootstrap por cookie del Portal. Nunca
    # autentica username/password.
    "paldaca_sso.backends.PortalSessionBackend",
]


# --- Internacionalización ----------------------------------------------

LANGUAGE_CODE = "es-ve"
TIME_ZONE = "America/Caracas"
USE_I18N = True
USE_TZ = True


# --- Estáticos ------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Los assets del build de Vite viven en `frontend/dist/assets/` y se piden a
# la RAÍZ (`/assets/index-*.js`), no bajo STATIC_URL. WhiteNoise los sirve
# desde aquí; sin esto el catch-all de `urls.py` respondía el index.html con
# Content-Type text/html para cada .js y la SPA no llegaba a arrancar
# (pantalla en blanco dentro del iframe, sin un solo error de servidor).
# `index_file` queda apagado a propósito: servir "/" es trabajo de
# `spa_shell`, que es quien tiene que responder también las rutas de cliente.
WHITENOISE_ROOT = BASE_DIR.parent / "frontend" / "dist"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# --- Sesión / cookies -----------------------------------------------------
#
# `paldaca_sso.checks` (E001/E002) aborta el arranque si SESSION_COOKIE_NAME
# colisiona con la del Portal o si SESSION_COOKIE_DOMAIN no está vacío —
# ambos son errores que romperían el SSO de TODA la Suite en silencio.

SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "planificacion_sessionid")
SESSION_COOKIE_DOMAIN = os.getenv("SESSION_COOKIE_DOMAIN", "") or None
SESSION_COOKIE_SECURE = _bool_env("SESSION_COOKIE_SECURE", "false")
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_PATH = "/"
SESSION_COOKIE_AGE = int(os.getenv("SESSION_COOKIE_AGE", "28800"))  # 8h, igual que el Portal
SESSION_SAVE_EVERY_REQUEST = True
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
CSRF_COOKIE_DOMAIN = SESSION_COOKIE_DOMAIN
CSRF_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE
CSRF_COOKIE_HTTPONLY = False  # el frontend necesita leerla para el header X-CSRFToken
CSRF_TRUSTED_ORIGINS = _csv_env(
    "DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:5181,http://localhost:8007"
)


# --- CORS (la SPA en dev corre en otro puerto que Django) -----------------

CORS_ALLOWED_ORIGINS = _csv_env("CORS_ALLOWED_ORIGINS", "http://localhost:5181")
CORS_ALLOW_CREDENTIALS = True


# --- DRF --------------------------------------------------------------

REST_FRAMEWORK = {
    # SessionAuthentication lee request.user, ya resuelto por
    # PaldacaSsoBootstrapMiddleware antes de llegar aquí — no hay login por
    # usuario/password en esta API.
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    # Cerrada por defecto: con PALDACA_SSO_ENABLED=false (deploy dark) el
    # middleware no actúa y esta API quedaría abierta (guía de módulo
    # federado, paso 6). Las vistas públicas (`me`, `logout`, `resync`,
    # `health`) declaran AllowAny explícitamente.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    # Traduce los errores de dominio de `services/` a HTTP (core/errores.py).
    "EXCEPTION_HANDLER": "core.errores.manejador_excepciones",
}


# --- Email (placeholder hasta que haga falta) ------------------------------

MAILERS = {
    "default": {"BACKEND": "django.core.mail.backends.console.EmailBackend"},
}


# --- Contrato SSO federado -------------------------------------------------
# Ver Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md §3.

PALDACA_SSO_ENABLED = _bool_env("PALDACA_SSO_ENABLED", "false")  # deploy dark por defecto
PALDACA_MODULO_CODIGO = os.getenv("PALDACA_MODULO_CODIGO", "planificacion")
PALDACA_PORTAL_URL = os.getenv(
    "PALDACA_PORTAL_URL", "http://localhost:5173" if DEBUG else "https://cpaldaca.com"
)
PALDACA_PORTAL_API_URL = os.getenv(
    "PALDACA_PORTAL_API_URL", "http://localhost:8000" if DEBUG else "https://cpaldaca.com"
)
PALDACA_SSO_PORTAL_COOKIE_NAME = os.getenv("PALDACA_SSO_PORTAL_COOKIE_NAME", "paldaca_sessionid")
PALDACA_SSO_LOGIN_URL = os.getenv("PALDACA_SSO_LOGIN_URL", f"{PALDACA_PORTAL_URL}/login")
PALDACA_SSO_REVALIDATE_SECONDS = int(os.getenv("PALDACA_SSO_REVALIDATE_SECONDS", "300"))
PALDACA_SSO_GRACE_SECONDS = int(os.getenv("PALDACA_SSO_GRACE_SECONDS", "1800"))
PALDACA_SSO_TIMEOUT_CONNECT = float(os.getenv("PALDACA_SSO_TIMEOUT_CONNECT", "2.0"))
PALDACA_SSO_TIMEOUT_READ = float(os.getenv("PALDACA_SSO_TIMEOUT_READ", "3.0"))
PALDACA_SSO_BREAKER_THRESHOLD = int(os.getenv("PALDACA_SSO_BREAKER_THRESHOLD", "3"))
PALDACA_SSO_BREAKER_OPEN_SECONDS = int(os.getenv("PALDACA_SSO_BREAKER_OPEN_SECONDS", "30"))
# Apagado a propósito en este pase de scaffold — no hay vista de login local
# implementada todavía (ver plan de integración). Reactivar exige antes
# construir esa pantalla en el frontend.
PALDACA_SSO_BREAKGLASS_ENABLED = _bool_env("PALDACA_SSO_BREAKGLASS_ENABLED", "false")
PALDACA_SSO_ADOPT_LOCAL_USERS = _bool_env("PALDACA_SSO_ADOPT_LOCAL_USERS", "true")


# --- Avisos en la campana del Portal (integracion_portal/notificaciones.py) ---
# Firma con secreto PROPIO del módulo (>= 32 caracteres); debe coincidir con
# PALDACA_NOTIF_SECRET_PLANIFICACION del Portal. Vacío = no se emiten avisos.

PALDACA_NOTIFICACIONES_ACTIVAS = _bool_env("PALDACA_NOTIFICACIONES_ACTIVAS", "true")
PALDACA_NOTIF_SECRET = os.getenv("PALDACA_NOTIF_SECRET", "")
# En un hilo aparte tras el commit, para que un Portal lento no demore la
# respuesta. Los tests lo apagan para poder afirmar sobre el envío.
PALDACA_NOTIF_ASINCRONO = _bool_env("PALDACA_NOTIF_ASINCRONO", "true")


# --- Contrato paldaca-embed v1 ----------------------------------------------
# Ver Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_EMBED.md.

PALDACA_SHELL_PATH = os.getenv("PALDACA_SHELL_PATH", "/planificacion")
_frame_ancestors = ["'self'", PALDACA_PORTAL_URL]
if DEBUG:
    _frame_ancestors += ["http://localhost:5173", "http://127.0.0.1:5173"]
else:
    _frame_ancestors += ["https://cpaldaca.com", "https://www.cpaldaca.com"]
PALDACA_FRAME_ANCESTORS = os.getenv(
    "PALDACA_FRAME_ANCESTORS",
    " ".join(dict.fromkeys(a for a in _frame_ancestors if a)),
)
