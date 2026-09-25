from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Feriado
from .services.dias_habiles import invalidar_cache


@receiver(post_save, sender=Feriado, dispatch_uid="calendario_feriado_guardado")
@receiver(post_delete, sender=Feriado, dispatch_uid="calendario_feriado_borrado")
def _feriados_cambiaron(**_kwargs):
    invalidar_cache()
