"""
Backend "de nombre" para la sesión SSO — no autentica por credenciales.

`django.contrib.auth.login()` exige un `backend` válido (registrado en
AUTHENTICATION_BACKENDS) para poder reconstruir el usuario en peticiones
siguientes vía `get_user()`. Aquí no hay credencial que validar — la cookie
del Portal ya fue validada por el Portal mismo — así que `authenticate()`
siempre devuelve None y solo se usa la implementación heredada de `get_user()`.
"""

from django.contrib.auth.backends import ModelBackend


class PortalSessionBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        return None
