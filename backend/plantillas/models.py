"""
Plantillas de tablero (fase 5).

Una plantilla es una **foto** de un tablero guardada como JSON (`contenido`):
columnas, etiquetas, campos personalizados y tarjetas con fechas **relativas
en días hábiles**, checklist y dependencias. No guarda personas, comentarios
ni historial. Al usarla se elige la fecha de inicio y todo se recalcula con el
calendario laboral (`services/plantillas.py`).

Alcance: personal (solo quien la creó), de equipo (sus miembros) o global
(todo el módulo; la crea el administrador del módulo).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q


class AlcancePlantilla(models.TextChoices):
    PERSONAL = "personal", "Personal"
    EQUIPO = "equipo", "Equipo"
    GLOBAL = "global", "Todo el módulo"


class PlantillaQuerySet(models.QuerySet):
    def visibles_para(self, usuario):
        from equipos.models import MiembroEquipo

        equipos = MiembroEquipo.objects.filter(usuario=usuario, equipo__archivado=False).values("equipo_id")
        return self.filter(
            Q(alcance=AlcancePlantilla.GLOBAL)
            | Q(alcance=AlcancePlantilla.PERSONAL, propietario=usuario)
            | Q(alcance=AlcancePlantilla.EQUIPO, equipo_id__in=equipos)
        )


class Plantilla(models.Model):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, max_length=2000)
    alcance = models.CharField(max_length=10, choices=AlcancePlantilla.choices)
    propietario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="plantillas"
    )
    equipo = models.ForeignKey(
        "equipos.Equipo", null=True, blank=True, on_delete=models.CASCADE, related_name="plantillas"
    )
    #: Formato versionado; ver `services/plantillas.py::FORMATO`.
    contenido = models.JSONField()
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    creada_en = models.DateTimeField(auto_now_add=True)
    actualizada_en = models.DateTimeField(auto_now=True)

    objects = PlantillaQuerySet.as_manager()

    class Meta:
        db_table = "planificacion_plantilla"
        ordering = ["nombre", "id"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(alcance="personal", propietario__isnull=False, equipo__isnull=True)
                    | Q(alcance="equipo", equipo__isnull=False, propietario__isnull=True)
                    | Q(alcance="global", equipo__isnull=True, propietario__isnull=True)
                ),
                name="plantilla_alcance_coherente",
            ),
        ]

    def __str__(self):
        return self.nombre
