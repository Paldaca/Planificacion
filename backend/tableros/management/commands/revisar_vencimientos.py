"""Crea las tarjetas recurrentes del día, avisa las tarjetas por vencer y
vencidas, y resuelve las que ya no aplican.

Programar una vez al día, temprano (Scheduled Task de Coolify):
    python manage.py revisar_vencimientos
Idempotente: correrlo de nuevo el mismo día no repite avisos.
"""

from django.core.management.base import BaseCommand
from django.test.utils import override_settings

from integracion_portal.services.notificaciones import procesar_pendientes
from tableros.services.recurrencias import generar
from tableros.services.vencimientos import revisar


class Command(BaseCommand):
    help = "Crea las tarjetas recurrentes y avisa por la campana del Portal las por vencer y vencidas."

    def handle(self, *args, **opciones):
        # Envío en el propio proceso: un hilo de fondo moriría al terminar el comando.
        with override_settings(PALDACA_NOTIF_ASINCRONO=False):
            # Primero las recurrentes: las que se crean hoy entran en la revisión.
            recurrentes = generar()
            resumen = revisar()
            envio = procesar_pendientes()
        self.stdout.write(
            f"Recurrentes creadas: {recurrentes['creadas']} ({recurrentes['series']} series) | "
            f"Tarjetas revisadas: {resumen['revisadas']} | avisos nuevos: {resumen['avisadas']} | "
            f"resueltos: {resumen['resueltas']} | enviados al Portal: {envio['enviados']}"
        )
