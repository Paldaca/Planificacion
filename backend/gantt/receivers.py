"""Reacciones a señales de `tableros` (que no conoce a `gantt`)."""

from django.db.models import Q
from django.dispatch import receiver

from tableros.signals import tarjeta_trasladada

from .models import Dependencia


@receiver(tarjeta_trasladada, dispatch_uid="gantt_quitar_dependencias_al_trasladar")
def quitar_dependencias(sender, card, **_kwargs):
    """Una dependencia solo vive dentro de un tablero: al trasladar se pierde."""
    Dependencia.objects.filter(Q(predecesora=card) | Q(sucesora=card)).delete()
