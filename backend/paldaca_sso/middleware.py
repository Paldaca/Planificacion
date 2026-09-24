"""
Bootstrap de sesión local a partir de la cookie del Portal (cookie-forwarding).

Ver "Mecanismo: cookie-forwarding" en
`Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md` para el diseño
completo. Adaptación respecto a la referencia de Nómina (que gatea TODA
petición excepto `/api/`, porque sus páginas de negocio son server-rendered):
Planificación es API-only, así que este middleware gatea lo opuesto — solo
`conf.gated_prefixes()` (por defecto `/api/*`, menos `conf.ungated_prefixes()`)
— y deja pasar siempre la carga del shell de la SPA (`index.html` y cualquier
ruta no-API), porque es el propio React quien tiene que poder pintar una
pantalla de "sesión expirada" / "sin acceso" / "portal no disponible" en vez
de que Django corte la carga del documento antes de que React exista.

Resumen del flujo (igual que la referencia):
  1. Sesiones break-glass (`paldaca_sso_breakglass` en sesión): se saltan
     enteras.
  2. Usuario YA autenticado localmente: solo revalida si cambió la cookie del
     Portal o venció el TTL (`PALDACA_SSO_REVALIDATE_SECONDS`).
  3. Usuario sin sesión local: intenta bootstrap si llega cookie del Portal;
     si no, 401 JSON (el frontend decide el redirect top-level al login).
  4. Degradación: 401/403 del Portal = negativa autoritativa (cierra ya). Todo
     lo demás (timeout, 5xx, JSON inválido) = `PortalUnavailable`, modo gracia.
"""

from __future__ import annotations

import hashlib
import time

from django.conf import settings
from django.contrib.auth import login as auth_login
from django.http import JsonResponse

from core.session_logout import apply_paldaca_cookie_clearance, close_paldaca_session

from . import conf
from .client import fetch_me
from .exceptions import PortalUnauthorized, PortalUnavailable
from .provisioning import upsert_mirror_user

SESSION_PORTAL_USER_ID = "paldaca_sso_portal_user_id"
SESSION_REVISION = "paldaca_sso_revision"
SESSION_CHECKED_AT = "paldaca_sso_checked_at"
SESSION_COOKIE_FP = "paldaca_sso_cookie_fp"
SESSION_GRACE_SINCE = "paldaca_sso_grace_since"
SESSION_BREAKGLASS = "paldaca_sso_breakglass"

#: Mientras se esté en modo gracia, no reintentar contra el Portal en cada
#: petición — el circuit breaker de client.py ya protege la red, esto evita
#: además repetir el parseo/lógica local en cada request de una sesión activa.
_GRACE_BACKOFF_SECONDS = 30


def _cookie_fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def _is_gated(path: str) -> bool:
    if not any(path.startswith(p) for p in conf.gated_prefixes()):
        return False
    return not any(path.startswith(p) for p in conf.ungated_prefixes())


class PaldacaSsoBootstrapMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not conf.enabled():
            return self.get_response(request)

        if not hasattr(request, "session"):
            return self.get_response(request)

        if request.session.get(SESSION_BREAKGLASS):
            return self.get_response(request)

        if not _is_gated(request.path):
            return self.get_response(request)

        portal_cookie_value = request.COOKIES.get(conf.portal_cookie_name())
        user = getattr(request, "user", None)
        locally_authenticated = bool(user and user.is_authenticated)

        if locally_authenticated:
            if not self._needs_revalidation(request, portal_cookie_value):
                return self.get_response(request)
        elif not portal_cookie_value:
            return self._unauthorized_response(request, "no_portal_cookie")

        return self._revalidate(request, portal_cookie_value, locally_authenticated)

    # -- decisión de si toca revalidar -------------------------------------

    def _needs_revalidation(self, request, portal_cookie_value) -> bool:
        session = request.session

        if not session.get(SESSION_REVISION):
            return True

        stored_fp = session.get(SESSION_COOKIE_FP)
        current_fp = _cookie_fingerprint(portal_cookie_value) if portal_cookie_value else None
        if current_fp != stored_fp:
            return True

        if self._in_grace_backoff(request):
            return False

        checked_at = session.get(SESSION_CHECKED_AT) or 0
        return (time.time() - checked_at) > conf.revalidate_seconds()

    def _in_grace_backoff(self, request) -> bool:
        grace_since = request.session.get(SESSION_GRACE_SINCE)
        return bool(grace_since and (time.time() - grace_since) < _GRACE_BACKOFF_SECONDS)

    # -- revalidación contra el Portal --------------------------------------

    def _revalidate(self, request, portal_cookie_value, locally_authenticated: bool):
        if not portal_cookie_value:
            return self._handle_unauthorized(request, locally_authenticated)

        try:
            identity = fetch_me(portal_cookie_value)
        except PortalUnauthorized:
            return self._handle_unauthorized(request, locally_authenticated)
        except PortalUnavailable as exc:
            return self._handle_unavailable(request, locally_authenticated, exc)

        usuario = upsert_mirror_user(identity)

        current_user = getattr(request, "user", None)
        if not locally_authenticated or not current_user or current_user.pk != usuario.pk:
            auth_login(request, usuario, backend="paldaca_sso.backends.PortalSessionBackend")

        self._store_markers(request, identity, portal_cookie_value)

        if not identity.tiene_modulo(conf.modulo_codigo()):
            return self._forbidden_response(request)

        return self.get_response(request)

    def _store_markers(self, request, identity, portal_cookie_value: str) -> None:
        from .revision import compute_revision

        request.session[SESSION_PORTAL_USER_ID] = identity.portal_user_id
        request.session[SESSION_REVISION] = compute_revision(identity)
        request.session[SESSION_CHECKED_AT] = time.time()
        request.session[SESSION_COOKIE_FP] = _cookie_fingerprint(portal_cookie_value)
        request.session[SESSION_GRACE_SINCE] = None

    # -- respuestas de error (JSON — las consume el React del frontend) ----

    def _unauthorized_response(self, request, reason: str):
        body = {
            "error": "unauthorized",
            "detail": "No hay sesión activa del Portal.",
            "reason": reason,
            "login_url": getattr(settings, "PALDACA_SSO_LOGIN_URL", ""),
        }
        return apply_paldaca_cookie_clearance(JsonResponse(body, status=401))

    def _handle_unauthorized(self, request, locally_authenticated: bool):
        if locally_authenticated:
            close_paldaca_session(request, reason="portal_unauthorized")
        return self._unauthorized_response(request, "portal_unauthorized")

    def _forbidden_response(self, request):
        body = {
            "error": "forbidden",
            "detail": "Tu cuenta no tiene acceso al módulo de Planificación.",
        }
        return JsonResponse(body, status=403)

    def _handle_unavailable(self, request, locally_authenticated: bool, exc: PortalUnavailable):
        if locally_authenticated:
            checked_at = request.session.get(SESSION_CHECKED_AT) or 0
            elapsed = time.time() - checked_at
            if elapsed < conf.grace_seconds():
                if not request.session.get(SESSION_GRACE_SINCE):
                    request.session[SESSION_GRACE_SINCE] = time.time()
                return self.get_response(request)
            close_paldaca_session(request, reason="portal_unavailable_grace_agotada")

        body = {
            "error": "portal_unavailable",
            "detail": str(exc),
            "portal_api_url": conf.portal_api_url() or None,
        }
        return apply_paldaca_cookie_clearance(JsonResponse(body, status=503))
