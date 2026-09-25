"""Reintenta los avisos al Portal que quedaron pendientes.

Programar cada pocos minutos (Scheduled Task de Coolify):
    python manage.py procesar_avisos
"""

from django.core.management.base import BaseCommand
from django.test.utils import override_settings

from integracion_portal.services.notificaciones import procesar_pendientes


class Command(BaseCommand):
    help = "Reintenta los avisos pendientes hacia la campana del Portal."

    def add_arguments(self, parser):
        parser.add_argument("--limite", type=int, default=200)

    def handle(self, *args, **opciones):
        with override_settings(PALDACA_NOTIF_ASINCRONO=False):
            resultado = procesar_pendientes(opciones["limite"])
        self.stdout.write(
            f"Avisos revisados: {resultado['revisados']} | enviados: {resultado['enviados']}"
        )
