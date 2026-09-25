"""Utilidades compartidas por los tests de todas las apps (no es un módulo de tests)."""

from __future__ import annotations

from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import Modulo, UsuarioModulo
from paldaca_sso.models import CuentaPortal

Usuario = get_user_model()


def crear_usuario(username, *, nombre="", apellido="", portal_id=None, modulo=True, rol="usuario"):
    usuario = Usuario.objects.create_user(
        username=username,
        first_name=nombre or username.capitalize(),
        last_name=apellido,
        email=f"{username}@cpaldaca.com",
        rol=rol,
    )
    if modulo:
        UsuarioModulo.objects.create(usuario=usuario, modulo=Modulo.objects.get(codigo="planificacion"))
    CuentaPortal.objects.create(usuario=usuario, portal_user_id=portal_id or 5000 + usuario.pk)
    return usuario


# SSO apagado: la identidad la pone `force_authenticate`; lo que se prueba es la
# API de negocio, no el bootstrap (eso lo cubren los tests de paldaca_sso).
# Avisos síncronos y sin secreto por defecto: cada test que los necesite los activa.
@override_settings(
    PALDACA_SSO_ENABLED=False,
    PALDACA_NOTIF_ASINCRONO=False,
    PALDACA_NOTIF_SECRET="",
    PALDACA_NOTIFICACIONES_ACTIVAS=True,
)
class ApiTestCase(TestCase):
    def setUp(self):
        super().setUp()
        # Caché en memoria compartida entre tests (feriados, config de tipos).
        cache.clear()
        # La configuración de tipos vendría del Portal: en tests, valores por defecto.
        parche = mock.patch("integracion_portal.services.notificaciones.config_tipo", return_value=None)
        parche.start()
        self.addCleanup(parche.stop)

    def cliente(self, usuario) -> APIClient:
        cliente = APIClient()
        cliente.force_authenticate(user=usuario)
        return cliente


SECRETO_PRUEBAS = "s" * 40


class ConAvisos(ApiTestCase):
    """Avisos activos y síncronos; `self.enviados` recoge lo que salió al Portal."""

    def setUp(self):
        super().setUp()
        from integracion_portal.services import notificaciones

        self.enviados = []
        ajustes = override_settings(PALDACA_NOTIF_SECRET=SECRETO_PRUEBAS, PALDACA_PORTAL_API_URL="http://portal.test")
        ajustes.enable()
        self.addCleanup(ajustes.disable)
        parche = mock.patch.object(notificaciones, "_post", side_effect=self._post_falso)
        parche.start()
        self.addCleanup(parche.stop)
        self.respuesta_portal = (True, False, "")

    def _post_falso(self, ruta, datos, secreto):
        if self.respuesta_portal[0]:
            self.enviados.append((ruta, datos))
        return self.respuesta_portal

    def emitidos(self, codigo):
        return [d for r, d in self.enviados if r.endswith("/eventos/") and d["codigo"] == codigo]

    def resueltos(self, codigo):
        return [d for r, d in self.enviados if r.endswith("/resolver/") and d["codigo"] == codigo]
