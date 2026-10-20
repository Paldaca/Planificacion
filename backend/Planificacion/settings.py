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
hardcodeado — y **por defecto es falso** (auditoría A-01): un despliegue al
que le falte la variable arranca seguro, no con trazas públicas. El desarrollo
local la pone en `true` en `backend/.env` (ver `.env.example`). El propio
Portal-Paldaca (y, hasta hace poco, Calidad/Códigos) tienen/tuvieron
`DEBUG=True` hardcodeado en producción (`IA_CONTEXT.md` §13); no se repite.
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

from .db import get_databases, usa_bd_servidor

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def _bool_env(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# --- Núcleo -------------------------------------------------------------

_CLAVE_DE_DESARROLLO = "django-insecure-planificacion-dev-only-cambiar-en-produccion"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", _CLAVE_DE_DESARROLLO)
DEBUG = _bool_env("DJANGO_DEBUG", "false")
if not DEBUG and (SECRET_KEY.startswith("django-insecure-") or len(SECRET_KEY) < 40):
    # Sin DEBUG = producción: nunca con la clave pública de desarrollo.
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY falta o es insegura (mínimo 40 caracteres). "
        "Para desarrollo local, DJANGO_DEBUG=true en backend/.env."
    )
ALLOWED_HOSTS = _csv_env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
if _bool_env("RUNNING_IN_DOCKER", "false"):
    # El HEALTHCHECK de la imagen llama a http://127.0.0.1:$PORT/api/health/
    # desde dentro del contenedor: con solo el dominio público, Django
    # respondería 400 (DisallowedHost) y Coolify daría el contenedor por caído.
    ALLOWED_HOSTS += [h for h in ("127.0.0.1", "localhost") if h not in ALLOWED_HOSTS]


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
    "gantt",
    "exportacion",
    "plantillas",
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
# Resolución en `Planificacion/db.py` (patrón Nómina): DATABASE_URL → MYSQL_*
# → SQLite local. MySQL propia, nunca la del Portal (auditoría A-02).

DATABASES = get_databases()

# Caché compartida por todos los workers (auditoría A-04): feriados, umbral de
# «vence pronto» y el breaker del SSO. Con MySQL, tabla en la BD (la crea
# `createcachetable` al arrancar el contenedor); con SQLite, memoria del proceso.
if usa_bd_servidor(DATABASES):
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.db.DatabaseCache",
            "LOCATION": "planificacion_cache",
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
# Secure por defecto fuera de DEBUG (auditoría A-03): en producción todo va por HTTPS.
SESSION_COOKIE_SECURE = _bool_env("SESSION_COOKIE_SECURE", "false" if DEBUG else "true")
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
# Los orígenes de desarrollo solo por defecto con DEBUG: en producción se
# declaran siempre (el dominio real del módulo).
CSRF_TRUSTED_ORIGINS = _csv_env(
    "DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:5181,http://localhost:8007" if DEBUG else ""
)


# --- HTTPS (auditoría A-03) ------------------------------------------------
#
# En producción TLS termina en el proxy de Coolify (Traefik), que avisa con
# X-Forwarded-Proto. Redirección a HTTPS y HSTS activas por defecto fuera de
# DEBUG; `/api/health/` queda fuera de la redirección porque el chequeo de
# salud de Coolify llama por HTTP dentro de la red del contenedor.

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = _bool_env("DJANGO_SECURE_SSL_REDIRECT", "false" if DEBUG else "true")
SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "0" if DEBUG else "31536000"))
# Solo abarca *.planificacion.cpaldaca.com (no existen): no afecta al resto de la Suite.
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG

SILENCED_SYSTEM_CHECKS = [
    # El embed en el Portal se controla con CSP `frame-ancestors`
    # (paldaca_sso.embed); `XFrameOptionsMiddleware` no admite lista de
    # orígenes y rompería el iframe, por eso no está.
    "security.W002",
    # HSTS preload exige inscribir el dominio en la lista de los navegadores:
    # decisión del dominio cpaldaca.com, no de un satélite.
    "security.W021",
    # MySQL no crea las restricciones únicas con condición («una invitación
    # pendiente», «nombre de campo activo»): esas reglas las cumplen los
    # servicios con el padre bloqueado (equipos.invitar, campos._guardar).
    "models.W036",
]


# --- CORS (la SPA en dev corre en otro puerto que Django) -----------------

# Solo hace falta en desarrollo (Vite en otro puerto). En producción la SPA es
# del mismo origen: sin la variable no se abre CORS a nadie (con credenciales,
# un `localhost` permitido dejaría a una página local llamar a producción).
CORS_ALLOWED_ORIGINS = _csv_env("CORS_ALLOWED_ORIGINS", "http://localhost:5181" if DEBUG else "")
CORS_ALLOW_CREDENTIALS = True
# El nombre de un archivo exportado viaja en esta cabecera; entre orígenes
# (Vite en desarrollo) el navegador solo la deja leer si se expone.
CORS_EXPOSE_HEADERS = ["Content-Disposition"]


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


# --- Correo -----------------------------------------------------------------
# La invitación a un equipo también sale por correo, desde
# notificaciones@cpaldaca.com (MXRouting). En DEBUG, sin EMAIL_BACKEND, se
# imprime en consola. La contraseña solo vive en el entorno.

EMAIL_HOST = os.getenv("EMAIL_HOST", "sunfire.mxrouting.net")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "465"))
EMAIL_USE_SSL = _bool_env("EMAIL_USE_SSL", "true")
EMAIL_USE_TLS = _bool_env("EMAIL_USE_TLS", "false")
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "notificaciones@cpaldaca.com")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "notificaciones@cpaldaca.com")
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "8"))
SERVER_EMAIL = DEFAULT_FROM_EMAIL
if DEBUG and not os.getenv("EMAIL_BACKEND"):
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
else:
    EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")


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


# --- Registro (auditoría A-12) ------------------------------------------------
# A la consola (Coolify recoge stdout/stderr). `LOG_LEVEL` para los registros
# propios (`planificacion.*`, `paldaca.*`: envíos de avisos, directorio, SSO);
# lo demás solo desde WARNING, para no ahogar los logs.

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "%(asctime)s %(levelname)s %(name)s | %(message)s"}},
    "handlers": {"consola": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["consola"], "level": "WARNING"},
    "loggers": {
        "planificacion": {"level": LOG_LEVEL},
        "paldaca": {"level": LOG_LEVEL},
    },
}
