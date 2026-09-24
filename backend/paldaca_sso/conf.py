"""
Punto único de lectura de settings de `paldaca_sso`, con sus defaults.

Centralizado aquí (en vez de `getattr(settings, ..., default)` disperso por el
resto de la app) para que los defaults vivan en un solo lugar. Adaptado de
`Nomina Paldaca/paldaca_sso/conf.py` — mismo contrato, ver
`Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md` §3.
"""

from django.conf import settings


def enabled() -> bool:
    """Interruptor maestro. En False, el middleware no hace nada (deploy dark)."""
    return bool(getattr(settings, "PALDACA_SSO_ENABLED", False))


def portal_url() -> str:
    """Origen del shell (SPA React) — destino de postMessage y de PALDACA_SSO_LOGIN_URL."""
    return (getattr(settings, "PALDACA_PORTAL_URL", "") or "").rstrip("/")


def portal_api_url() -> str:
    """
    Origen de la API del Portal — backchannel de /api/auth/me/.

    El Portal sirve el SPA y proxea /api/ bajo el mismo origen (cpaldaca.com);
    api.cpaldaca.com quedó como alias opcional, no asumir que está disponible.
    """
    return (getattr(settings, "PALDACA_PORTAL_API_URL", "") or "").rstrip("/")


def portal_cookie_name() -> str:
    return getattr(settings, "PALDACA_SSO_PORTAL_COOKIE_NAME", "paldaca_sessionid")


def modulo_codigo() -> str:
    """Código de este satélite ante el Portal (X-Paldaca-Client)."""
    return getattr(settings, "PALDACA_MODULO_CODIGO", "planificacion") or "planificacion"


def revalidate_seconds() -> int:
    return int(getattr(settings, "PALDACA_SSO_REVALIDATE_SECONDS", 300))


def grace_seconds() -> int:
    return int(getattr(settings, "PALDACA_SSO_GRACE_SECONDS", 1800))


def timeout_connect() -> float:
    return float(getattr(settings, "PALDACA_SSO_TIMEOUT_CONNECT", 2.0))


def timeout_read() -> float:
    return float(getattr(settings, "PALDACA_SSO_TIMEOUT_READ", 3.0))


def breakglass_enabled() -> bool:
    return bool(getattr(settings, "PALDACA_SSO_BREAKGLASS_ENABLED", False))


def adopt_local_users() -> bool:
    return bool(getattr(settings, "PALDACA_SSO_ADOPT_LOCAL_USERS", True))


def breaker_failure_threshold() -> int:
    return int(getattr(settings, "PALDACA_SSO_BREAKER_THRESHOLD", 3))


def breaker_open_seconds() -> int:
    return int(getattr(settings, "PALDACA_SSO_BREAKER_OPEN_SECONDS", 30))


def me_endpoint() -> str:
    return f"{portal_api_url()}/api/auth/me/"


def gated_prefixes() -> tuple[str, ...]:
    """
    Prefijos de ruta que este middleware SÍ gatea.

    Planificación es API-only (sin páginas server-rendered): a diferencia del
    patrón de Nómina —que gatea todo excepto `/api/`—, aquí se invierte: el
    shell de la SPA (`index.html`, cualquier ruta no-API) se sirve siempre
    (200) sin pasar por el bootstrap de sesión, porque el propio React es
    quien necesita poder pintar una pantalla de "sesión expirada" / "sin
    acceso" / "portal no disponible" en vez de que Django corte la carga del
    documento. Solo `/api/*` requiere identidad resuelta.
    """
    return getattr(settings, "PALDACA_SSO_GATED_PREFIXES", ("/api/",))


def ungated_prefixes() -> tuple[str, ...]:
    """Excepciones dentro de los prefijos gateados (siempre públicas)."""
    return getattr(settings, "PALDACA_SSO_UNGATED_PREFIXES", ("/api/health/",))
