"""
Días no laborables de la empresa.

- `recurrente=True`: se repite cada año en el mismo día y mes (se guarda con
  el año 2000; solo cuentan día y mes). Ej.: 5 de julio.
- `recurrente=False`: una fecha puntual. Ej.: un puente decretado.
Los feriados MÓVILES (Carnaval, Jueves y Viernes Santo) no se guardan: se
calculan cada año a partir de la Pascua (`services/dias_habiles.py`).
"""

from django.conf import settings
from django.db import models

ANIO_RECURRENTE = 2000


class Feriado(models.Model):
    fecha = models.DateField()
    nombre = models.CharField(max_length=100)
    recurrente = models.BooleanField(default=False, help_text="Se repite cada año (solo cuentan día y mes).")
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "planificacion_feriado"
        ordering = ["fecha"]
        constraints = [
            models.UniqueConstraint(fields=["fecha", "recurrente"], name="feriado_unico_por_fecha"),
        ]

    def __str__(self):
        return f"{self.fecha:%d/%m}{'' if self.recurrente else f'/{self.fecha:%Y}'} {self.nombre}"
