"""Avisa tarjetas por vencer y vencidas, y resuelve las que ya no aplican.

Programar una vez al día, temprano (Scheduled Task de Coolify):
    python manage.py revisar_vencimientos
Idempotente: correrlo de nuevo el mismo día no repite avisos.
"""

from django.core.management.base import BaseCommand
from django.test.utils import override_settings

from integracion_portal.services.notificaciones import procesar_pendientes
from tableros.services.vencimientos import revisar


class Command(BaseCommand):
    help = "Avisa por la campana del Portal las tarjetas por vencer y vencidas."

    def handle(self, *args, **opciones):
        # Envío en el propio proceso: un hilo de fondo moriría al terminar el comando.
        with override_settings(PALDACA_NOTIF_ASINCRONO=False):
            resumen = revisar()
            envio = procesar_pendientes()
        self.stdout.write(
            f"Tarjetas revisadas: {resumen['revisadas']} | avisos nuevos: {resumen['avisadas']} | "
            f"resueltos: {resumen['resueltas']} | enviados al Portal: {envio['enviados']}"
        )
