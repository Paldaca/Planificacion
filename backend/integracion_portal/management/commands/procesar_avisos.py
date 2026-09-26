"""Reintenta los avisos al Portal que quedaron pendientes y purga los viejos.

Programar cada pocos minutos (Scheduled Task de Coolify):
    python manage.py procesar_avisos

Borra además los enviados de más de 30 días y los descartados de más de 90
(la bandeja no crece sin límite; auditoría A-05).
"""

from django.core.management.base import BaseCommand
from django.test.utils import override_settings

from integracion_portal.services.notificaciones import procesar_pendientes, purgar


class Command(BaseCommand):
    help = "Reintenta los avisos pendientes hacia la campana del Portal."

    def add_arguments(self, parser):
        parser.add_argument("--limite", type=int, default=200)

    def handle(self, *args, **opciones):
        with override_settings(PALDACA_NOTIF_ASINCRONO=False):
            resultado = procesar_pendientes(opciones["limite"])
        purgados = purgar()
        self.stdout.write(
            f"Avisos revisados: {resultado['revisados']} | enviados: {resultado['enviados']} | "
            f"purgados: {purgados['enviados']} enviados, {purgados['descartados']} descartados"
        )
