from django.conf import settings
from django.contrib.auth import logout as auth_logout
from django.http import HttpResponseBase


def _expire_cookie(
    response: HttpResponseBase,
    name: str,
    *,
    path: str,
    domain: str | None,
    secure: bool,
    httponly: bool,
    samesite: str,
) -> None:
    """Expira cookie SSO; set_cookie con max_age=0 soporta secure (delete_cookie no)."""
    response.set_cookie(
        name,
        "",
        max_age=0,
        path=path,
        domain=domain,
        secure=secure,
        httponly=httponly,
        samesite=samesite,
    )


def apply_paldaca_cookie_clearance(response: HttpResponseBase) -> HttpResponseBase:
    """
    Fuerza el borrado de las cookies PROPIAS de Planificación (sesión + CSRF).

    Deliberadamente NO borra `paldaca_sessionid`: esa es la cookie del Portal,
    HttpOnly en `.cpaldaca.com` — solo el Portal puede limpiarla. Planificación
    es un satélite FEDERADO sin `SESSION_COOKIE_DOMAIN` compartido (ver
    paldaca_sso/checks.py E002); si algún día se configurara por error un
    dominio compartido, borrar aquí la cookie del Portal cerraría sesión en
    TODA la Suite desde el logout de Planificación.
    """
    path = getattr(settings, "SESSION_COOKIE_PATH", "/") or "/"
    secure = settings.SESSION_COOKIE_SECURE
    samesite = getattr(settings, "SESSION_COOKIE_SAMESITE", "Lax")
    domain = settings.SESSION_COOKIE_DOMAIN
    csrf_domain = getattr(settings, "CSRF_COOKIE_DOMAIN", None) or domain

    cookie_specs = (
        (settings.SESSION_COOKIE_NAME, True),
        (getattr(settings, "CSRF_COOKIE_NAME", "csrftoken"), False),
    )

    domains: list[str | None] = [None]
    if domain:
        domains.append(domain)
    if csrf_domain and csrf_domain not in domains:
        domains.append(csrf_domain)

    for name, httponly in cookie_specs:
        for cookie_domain in domains:
            _expire_cookie(
                response,
                name,
                path=path,
                domain=cookie_domain,
                secure=secure,
                httponly=httponly,
                samesite=samesite,
            )

    return response


def close_paldaca_session(request, *, reason: str = "unspecified"):
    """Cierra la sesión Django local (SSO)."""
    import logging

    logging.getLogger("paldaca.auth").info(
        "SSO_SESSION_CLOSED | reason=%s user=%s",
        reason,
        getattr(request.user, "pk", None) if hasattr(request, "user") else None,
    )
    auth_logout(request)
    if hasattr(request, "session"):
        request.session.flush()
