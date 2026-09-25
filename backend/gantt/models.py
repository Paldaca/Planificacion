"""
Dependencias entre tarjetas de un mismo tablero (vista Gantt).

`desfase_dias` se cuenta en días HÁBILES (`calendario`) y puede ser negativo
(solape). Nunca hay ciclos: se validan al crear (`services/dependencias.py`).
"""

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class TipoDependencia(models.TextChoices):
    FIN_INICIO = "fin_inicio", "Fin → inicio"
    INICIO_INICIO = "inicio_inicio", "Inicio → inicio"
    FIN_FIN = "fin_fin", "Fin → fin"


class DependenciaQuerySet(models.QuerySet):
    def del_tablero(self, tablero):
        """Solo las que tienen ambas puntas en el tablero y ninguna archivada."""
        return self.filter(
            predecesora__tablero=tablero,
            sucesora__tablero=tablero,
            predecesora__archivada=False,
            sucesora__archivada=False,
        )


class Dependencia(models.Model):
    predecesora = models.ForeignKey("tableros.Card", on_delete=models.CASCADE, related_name="dependencias_salientes")
    sucesora = models.ForeignKey("tableros.Card", on_delete=models.CASCADE, related_name="dependencias_entrantes")
    tipo = models.CharField(max_length=14, choices=TipoDependencia.choices, default=TipoDependencia.FIN_INICIO)
    desfase_dias = models.SmallIntegerField(default=0, help_text="Días hábiles; negativo = solape.")
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    creada_en = models.DateTimeField(auto_now_add=True)

    objects = DependenciaQuerySet.as_manager()

    class Meta:
        db_table = "planificacion_dependencia"
        constraints = [
            models.UniqueConstraint(fields=["predecesora", "sucesora"], name="dependencia_unica"),
            models.CheckConstraint(condition=~Q(predecesora=F("sucesora")), name="dependencia_no_a_si_misma"),
        ]

    def __str__(self):
        return f"{self.predecesora_id} → {self.sucesora_id} ({self.tipo}, {self.desfase_dias:+d})"
