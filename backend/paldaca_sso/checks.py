"""
System checks que abortan el arranque ante configuraciones que romperían el
SSO de toda la Suite en silencio. La guía de satélites ACOPLADOS instruye
poner `SESSION_COOKIE_NAME=paldaca_sessionid` — aplicado a un satélite
FEDERADO como Planificación, eso hace colisionar (o, peor, con
`SESSION_COOKIE_DOMAIN` compartido, sobrescribir) la sesión del Portal. Ver
`CONTRATO_SSO_FEDERADO.md` §3/§6 (R-03).
"""

from django.conf import settings
from django.core.checks import Error, Warning, register

from . import conf


@register()
def check_cookie_name_no_colisiona(app_configs, **kwargs):
    if not conf.enabled():
        return []
    if settings.SESSION_COOKIE_NAME == conf.portal_cookie_name():
        return [
            Error(
                "SESSION_COOKIE_NAME no puede ser igual al nombre de la cookie del Portal.",
                hint=(
                    "Planificación es un satélite FEDERADO: su cookie de sesión debe ser "
                    "distinta de PALDACA_SSO_PORTAL_COOKIE_NAME (paldaca_sessionid). "
                    "Usar 'planificacion_sessionid' o similar."
                ),
                id="paldaca_sso.E001",
            )
        ]
    return []


@register()
def check_session_cookie_domain_vacio(app_configs, **kwargs):
    if not conf.enabled():
        return []
    if getattr(settings, "SESSION_COOKIE_DOMAIN", None):
        return [
            Error(
                "SESSION_COOKIE_DOMAIN debe estar vacío en un satélite federado.",
                hint=(
                    "Con SESSION_COOKIE_DOMAIN=.cpaldaca.com, la sesión local de "
                    "Planificación se escribiría como cookie de dominio compartido y "
                    "sobrescribiría la sesión del Portal en toda la Suite."
                ),
                id="paldaca_sso.E002",
            )
        ]
    return []


@register()
def check_secret_key_no_default(app_configs, **kwargs):
    if not settings.SECRET_KEY or settings.SECRET_KEY.startswith("django-insecure-"):
        return [
            Warning(
                "DJANGO_SECRET_KEY no está configurada (usa el default inseguro).",
                hint=(
                    "No debe alinearse con la SECRET_KEY del Portal — en un satélite "
                    "federado compartirla no aporta nada. Solo hace falta que sea "
                    "propia y secreta en producción."
                ),
                id="paldaca_sso.W003",
            )
        ]
    return []
