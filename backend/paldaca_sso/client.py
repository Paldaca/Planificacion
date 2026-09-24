"""
Cliente HTTP hacia `GET /api/auth/me/` del Portal (cookie-forwarding).

Reenvía ÚNICAMENTE el valor de la cookie de sesión del Portal, nunca el
header `Cookie` crudo de la petición entrante — no hay motivo para que la
cookie propia de Planificación (`planificacion_sessionid`) ni su `csrftoken`
salgan hacia otro origen. `allow_redirects=False`: un 302 (redirect a login,
SSL redirect) no es un éxito de autenticación y no debe seguirse.

Breaker de circuito en `django.core.cache` (LocMemCache por defecto, por
worker): sin él, con el Portal caído cada petición a Planificación paga el
timeout completo y satura los workers.
"""

from __future__ import annotations

import time

import requests
from django.core.cache import cache
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from . import conf
from .exceptions import PortalUnauthorized, PortalUnavailable
from .identity import Identity, parse_payload

_BREAKER_FAILURES_KEY = "paldaca_sso:breaker:failures"
_BREAKER_OPEN_UNTIL_KEY = "paldaca_sso:breaker:open_until"

_session = requests.Session()
_retry = Retry(
    total=1,
    connect=1,
    # read=0 a propósito: un read-timeout significa que la petición SÍ llegó
    # al Portal. Reintentar solo duplica la latencia del peor caso.
    read=0,
    backoff_factor=0.2,
    status_forcelist=(502, 503, 504),
    allowed_methods=frozenset(["GET"]),
)
_adapter = HTTPAdapter(pool_connections=4, pool_maxsize=8, max_retries=_retry)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


def _breaker_is_open() -> bool:
    open_until = cache.get(_BREAKER_OPEN_UNTIL_KEY)
    return bool(open_until and time.time() < open_until)


def _breaker_record_failure() -> None:
    failures = (cache.get(_BREAKER_FAILURES_KEY) or 0) + 1
    cache.set(_BREAKER_FAILURES_KEY, failures, timeout=conf.breaker_open_seconds() * 4)
    if failures >= conf.breaker_failure_threshold():
        cache.set(
            _BREAKER_OPEN_UNTIL_KEY,
            time.time() + conf.breaker_open_seconds(),
            timeout=conf.breaker_open_seconds() * 2,
        )


def _breaker_record_success() -> None:
    cache.delete(_BREAKER_FAILURES_KEY)
    cache.delete(_BREAKER_OPEN_UNTIL_KEY)


def fetch_me(portal_cookie_value: str) -> Identity:
    """
    Resuelve identidad contra el Portal. Lanza `PortalUnauthorized` (negativa
    autoritativa) o `PortalUnavailable` (nada concluyente — dispara gracia).
    """
    if _breaker_is_open():
        raise PortalUnavailable("Circuito abierto: fallos recientes del Portal")

    try:
        response = _session.get(
            conf.me_endpoint(),
            cookies={conf.portal_cookie_name(): portal_cookie_value},
            headers={"Accept": "application/json", "X-Paldaca-Client": conf.modulo_codigo()},
            timeout=(conf.timeout_connect(), conf.timeout_read()),
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        _breaker_record_failure()
        raise PortalUnavailable(f"Error de red hacia el Portal: {exc}") from exc

    if response.status_code in (401, 403):
        _breaker_record_success()  # el Portal SÍ respondió; no es una caída
        raise PortalUnauthorized(f"Portal devolvió {response.status_code}")

    if response.status_code != 200:
        _breaker_record_failure()
        raise PortalUnavailable(f"Portal devolvió status inesperado {response.status_code}")

    content_type = response.headers.get("Content-Type", "")
    if "application/json" not in content_type:
        # DEBUG=True en el Portal puede devolver traceback HTML en un 500 —
        # pero también podría llegar aquí un 200 de un proxy/WAF mal
        # configurado. En ningún caso es JSON de auth/me válido.
        _breaker_record_failure()
        raise PortalUnavailable(f"Portal devolvió Content-Type inesperado: {content_type!r}")

    try:
        data = response.json()
    except ValueError as exc:
        _breaker_record_failure()
        raise PortalUnavailable(f"Portal devolvió 200 con JSON inválido: {exc}") from exc

    try:
        identity = parse_payload(data)
    except PortalUnavailable:
        _breaker_record_failure()
        raise

    _breaker_record_success()
    return identity
