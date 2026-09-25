"""Utilidades compartidas por los tests de la API de Planificación."""

from __future__ import annotations

from unittest import mock

from django.contrib.auth import get_user_model
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
        # La configuración de tipos vendría del Portal: en tests, valores por defecto.
        parche = mock.patch("integracion_portal.notificaciones.config_tipo", return_value=None)
        parche.start()
        self.addCleanup(parche.stop)

    def cliente(self, usuario) -> APIClient:
        cliente = APIClient()
        cliente.force_authenticate(user=usuario)
        return cliente
