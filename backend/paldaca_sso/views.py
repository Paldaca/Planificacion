"""
Vistas propias del SSO federado, consumidas por el frontend React.

No hay vista de "login": el bootstrap de identidad ocurre en `middleware.py`
a partir de la cookie del Portal en cada petición gateada — el frontend nunca
envía credenciales, solo llama `GET /api/auth/me/` y reacciona al status.
"""

from __future__ import annotations

from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.session_logout import apply_paldaca_cookie_clearance, close_paldaca_session

from . import conf
from .middleware import SESSION_CHECKED_AT, SESSION_REVISION


@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def me(request):
    """
    Identidad local ya resuelta por `PaldacaSsoBootstrapMiddleware` (esta
    ruta está gateada — si llegamos aquí, `request.user` es válido).

    `ensure_csrf_cookie`: con `SessionAuthentication` al frente, DRF exige
    CSRF en los métodos no seguros. Este GET es el primer contacto del SPA,
    así que es donde tiene que llegar la cookie `csrftoken`; sin ella,
    cualquier POST posterior del frontend moriría en 403. Mismo motivo y
    misma solución que en `Portal-Paldaca/backend/core/views_auth.py::me`.
    """
    user = request.user
    if not user.is_authenticated:
        return Response({"error": "unauthorized"}, status=401)

    return Response(
        {
            "id": user.pk,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "rol": user.rol,
            # Equivale exactamente a `permisos["planificacion"].admin` del
            # Portal: allí el flag es `is_superuser or rol == administrador`,
            # el mismo criterio que espeja `provisioning._apply_identity_to_user`.
            "es_administrador": user.es_administrador,
            "es_superadmin": user.es_superadmin,
            "disciplina": user.disciplina.nombre if user.disciplina_id else None,
            "perfil": user.perfil.nombre if user.perfil_id else None,
            "modulos": user._codigos_modulos_asignados(),
            "modulo_codigo": conf.modulo_codigo(),
        }
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def logout(request):
    """
    Cierra la sesión LOCAL de Planificación. Nunca toca `paldaca_sessionid`
    (esa es del Portal — ver `core.session_logout`).

    `authentication_classes([])`: `SessionAuthentication` valida CSRF dentro
    de `authenticate()` y devolvería 403 antes de entrar a la vista. Cerrar
    sesión no necesita identificar a nadie — `session.flush()` opera sobre la
    cookie que trae la petición — así que basta con no autenticar. Mismo
    patrón (y mismo razonamiento) que `logout_view` del Portal.
    """
    close_paldaca_session(request, reason="logout_usuario")
    portal_url = conf.portal_url()
    response = Response({"ok": True, "login_url": f"{portal_url}/login" if portal_url else None})
    return apply_paldaca_cookie_clearance(response)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def resync(request):
    """Descarta los marcadores de sincronización para forzar una
    revalidación completa contra el Portal en la siguiente petición gateada.

    Sin autenticación por el mismo motivo que `logout`: quien llega aquí es
    justamente alguien a quien le falló la sesión, y el CSRF de
    `SessionAuthentication` lo dejaría fuera del único botón de reintento."""
    if hasattr(request, "session"):
        request.session.pop(SESSION_CHECKED_AT, None)
        request.session.pop(SESSION_REVISION, None)
    return Response({"ok": True})
