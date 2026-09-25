"""
Bandeja de salida de avisos hacia el Portal.

Cada aviso (emitir o resolver) se guarda en la MISMA transacción que el
cambio que lo provoca y se envía después del commit. Si el Portal no responde,
queda pendiente y `manage.py procesar_avisos` lo reintenta con espera
creciente: un Portal caído nunca pierde avisos ni revierte el guardado local.
"""

from django.db import models


class AvisoSaliente(models.Model):
    class Tipo(models.TextChoices):
        EMITIR = "emitir", "Emitir"
        RESOLVER = "resolver", "Resolver"

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        ENVIADO = "enviado", "Enviado"
        DESCARTADO = "descartado", "Descartado"

    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    codigo = models.CharField(max_length=80, help_text="Tipo de notificación del Portal.")
    datos = models.JSONField(help_text="Cuerpo exacto que se envía (se firma al enviar).")
    clave_agrupacion = models.CharField(max_length=120, blank=True)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.PENDIENTE)
    intentos = models.PositiveSmallIntegerField(default=0)
    proximo_intento = models.DateTimeField(null=True, blank=True)
    ultimo_error = models.CharField(max_length=300, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    enviado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "planificacion_aviso_saliente"
        ordering = ["id"]
        indexes = [models.Index(fields=["estado", "proximo_intento"], name="aviso_pendientes_idx")]

    def __str__(self):
        return f"{self.tipo} {self.codigo} ({self.estado})"
