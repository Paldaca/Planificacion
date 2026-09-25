"""
Tableros, columnas, cards y comentarios.

Reglas que viven aquí (y no en el frontend):
- Un tablero es `personal` (uno por usuario, privado) o de `equipo`.
- Columnas predeterminadas al crear: Tareas / En curso / Hecho; "Hecho" es la
  columna final: sus cards cuentan como terminadas (`completada_en`).
- Nada se borra en la operación normal: se archiva.
- `version` en cards y columnas: concurrencia optimista (409 si está vieja).

Ver docs/plan-modulo-planificacion.md §4.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q


class TipoTablero(models.TextChoices):
    PERSONAL = "personal", "Personal"
    EQUIPO = "equipo", "Equipo"


class Urgencia(models.TextChoices):
    BAJA = "baja", "Baja"
    MEDIA = "media", "Media"
    ALTA = "alta", "Alta"
    CRITICA = "critica", "Crítica"


class EnGantt(models.TextChoices):
    """Regla por card para la vista Gantt (fase 3); se guarda desde ya."""

    HEREDAR = "heredar", "Según la columna"
    SI = "si", "Sí"
    NO = "no", "No"


COLUMNAS_PREDETERMINADAS = (
    ("Tareas", False),
    ("En curso", False),
    ("Hecho", True),
)


class Tablero(models.Model):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, max_length=2000)
    tipo = models.CharField(max_length=10, choices=TipoTablero.choices)
    propietario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="tableros_personales",
    )
    equipo = models.ForeignKey(
        "equipos.Equipo",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="tableros",
    )
    archivado = models.BooleanField(default=False)
    siguiente_numero_card = models.PositiveIntegerField(default=1)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "planificacion_tablero"
        ordering = ["nombre"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(tipo="personal", propietario__isnull=False, equipo__isnull=True)
                    | Q(tipo="equipo", equipo__isnull=False, propietario__isnull=True)
                ),
                name="tablero_personal_o_de_equipo",
            ),
            models.UniqueConstraint(
                fields=["propietario"],
                condition=Q(tipo="personal"),
                name="un_tablero_personal_por_usuario",
            ),
        ]

    def __str__(self):
        return self.nombre

    @property
    def es_personal(self) -> bool:
        return self.tipo == TipoTablero.PERSONAL


class Columna(models.Model):
    tablero = models.ForeignKey(Tablero, on_delete=models.CASCADE, related_name="columnas")
    nombre = models.CharField(max_length=60)
    orden = models.PositiveIntegerField(default=0)
    es_final = models.BooleanField(
        default=False, help_text="Sus cards cuentan como terminadas."
    )
    incluir_en_gantt = models.BooleanField(default=True)
    archivada = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=1)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "planificacion_columna"
        ordering = ["orden", "id"]

    def __str__(self):
        return f"{self.tablero_id}/{self.nombre}"


class Card(models.Model):
    tablero = models.ForeignKey(Tablero, on_delete=models.CASCADE, related_name="cards")
    columna = models.ForeignKey(Columna, on_delete=models.PROTECT, related_name="cards")
    numero = models.PositiveIntegerField()
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True, max_length=10000)
    fecha_inicio = models.DateField(null=True, blank=True)
    fecha_fin = models.DateField(null=True, blank=True)
    urgencia = models.CharField(max_length=10, choices=Urgencia.choices, default=Urgencia.MEDIA)
    orden = models.PositiveIntegerField(default=0)
    en_gantt = models.CharField(max_length=10, choices=EnGantt.choices, default=EnGantt.HEREDAR)
    responsables = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="ResponsableCard",
        through_fields=("card", "usuario"),
        related_name="cards_asignadas",
        blank=True,
    )
    completada_en = models.DateTimeField(null=True, blank=True)
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="cards_creadas",
    )
    archivada = models.BooleanField(default=False)
    archivada_en = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "planificacion_card"
        ordering = ["orden", "id"]
        constraints = [
            models.UniqueConstraint(fields=["tablero", "numero"], name="numero_card_unico_por_tablero"),
        ]

    def __str__(self):
        return f"#{self.numero} {self.titulo}"


class ResponsableCard(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="asignaciones")
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="asignaciones_card"
    )
    asignado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    asignado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "planificacion_responsable_card"
        constraints = [
            models.UniqueConstraint(fields=["card", "usuario"], name="responsable_unico_por_card"),
        ]


class Comentario(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="comentarios")
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="comentarios"
    )
    texto = models.TextField(max_length=5000)
    creado_en = models.DateTimeField(auto_now_add=True)
    editado_en = models.DateTimeField(null=True, blank=True)
    eliminado = models.BooleanField(default=False)

    class Meta:
        db_table = "planificacion_comentario"
        ordering = ["creado_en", "id"]

    def __str__(self):
        return f"Comentario {self.pk} en card {self.card_id}"
