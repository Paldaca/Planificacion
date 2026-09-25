"""
Tableros, columnas, cards y comentarios.

Reglas que viven aquí (y no en el frontend):
- Un tablero es `personal` (uno por usuario, privado) o de `equipo`.
- Columnas predeterminadas al crear: Tareas / En curso / Hecho; "Hecho" es la
  columna final: sus cards cuentan como terminadas (`completada_en`).
- Nada se borra en la operación normal: se archiva.
- `version` en cards y columnas: concurrencia optimista (409 si está vieja).

Lecturas reutilizables en los QuerySet (`Tablero.objects.visibles_para(u)`,
`Card.objects.activas().con_detalle()`); reglas de UNA instancia en métodos
del modelo; operaciones con efectos (historial, avisos) en `services/`.

Ver docs/plan-modulo-planificacion.md §4.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Count, F, Q


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


class AvisoVencimiento(models.TextChoices):
    """Último aviso de vencimiento emitido (para avisar una sola vez por estado)."""

    NINGUNO = "", "Ninguno"
    POR_VENCER = "por_vencer", "Por vencer"
    VENCIDA = "vencida", "Vencida"


COLUMNAS_PREDETERMINADAS = (
    ("Tareas", False),
    ("En curso", False),
    ("Hecho", True),
)


def _equipos_de(usuario):
    from equipos.models import MiembroEquipo

    return MiembroEquipo.objects.filter(usuario=usuario).values("equipo_id")


def _q_visible(usuario, prefijo: str = "") -> Q:
    """Tablero personal propio o de un equipo activo donde es miembro."""
    return Q(**{f"{prefijo}tipo": TipoTablero.PERSONAL, f"{prefijo}propietario": usuario}) | Q(
        **{
            f"{prefijo}tipo": TipoTablero.EQUIPO,
            f"{prefijo}equipo__archivado": False,
            f"{prefijo}equipo_id__in": _equipos_de(usuario),
        }
    )


class TableroQuerySet(models.QuerySet):
    def activos(self):
        return self.filter(archivado=False)

    def visibles_para(self, usuario):
        return self.activos().filter(_q_visible(usuario))


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

    objects = TableroQuerySet.as_manager()

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

    def personas_asignables(self) -> list:
        """Quién puede ser responsable: el dueño (personal) o los miembros del equipo."""
        if self.es_personal:
            return [self.propietario]
        return [
            m.usuario
            for m in self.equipo.miembros.select_related("usuario__disciplina").order_by(
                "usuario__first_name", "usuario__last_name"
            )
        ]


class ColumnaQuerySet(models.QuerySet):
    def activas(self):
        return self.filter(archivada=False).order_by("orden", "id")


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

    objects = ColumnaQuerySet.as_manager()

    class Meta:
        db_table = "planificacion_columna"
        ordering = ["orden", "id"]

    def __str__(self):
        return f"{self.tablero_id}/{self.nombre}"


class CardQuerySet(models.QuerySet):
    def activas(self):
        """Visibles en el tablero: ni archivadas ni en columnas archivadas."""
        return self.filter(archivada=False, columna__archivada=False)

    def abiertas(self):
        return self.filter(archivada=False, completada_en__isnull=True)

    def visibles_para(self, usuario):
        return self.filter(tablero__archivado=False).filter(_q_visible(usuario, "tablero__"))

    def asignadas_a(self, usuario):
        return self.filter(asignaciones__usuario=usuario)

    def con_detalle(self):
        """Todo lo que pinta una tarjeta, sin consultas por card."""
        return self.select_related("columna", "creada_por", "tablero__equipo", "tablero__propietario").prefetch_related(
            "asignaciones__usuario__disciplina"
        ).annotate(
            num_comentarios=Count("comentarios", filter=Q(comentarios__eliminado=False), distinct=True),
            num_items=Count("checklist", distinct=True),
            num_items_hechos=Count("checklist", filter=Q(checklist__hecho=True), distinct=True),
        )

    def por_fecha_fin(self):
        return self.order_by(F("fecha_fin").asc(nulls_last=True), "id")


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
    aviso_vencimiento = models.CharField(
        max_length=12, choices=AvisoVencimiento.choices, default=AvisoVencimiento.NINGUNO, blank=True
    )
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

    objects = CardQuerySet.as_manager()

    class Meta:
        db_table = "planificacion_card"
        ordering = ["orden", "id"]
        constraints = [
            models.UniqueConstraint(fields=["tablero", "numero"], name="numero_card_unico_por_tablero"),
            models.CheckConstraint(
                condition=Q(fecha_inicio__isnull=True) | Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=F("fecha_inicio")),
                name="card_fin_no_antes_de_inicio",
                violation_error_message="La fecha final no puede ser anterior a la de inicio.",
            ),
        ]

    def __str__(self):
        return f"#{self.numero} {self.titulo}"

    def clean(self):
        if self.fecha_inicio and self.fecha_fin and self.fecha_fin < self.fecha_inicio:
            raise ValidationError({"fecha_fin": "La fecha final no puede ser anterior a la de inicio."})

    def alinear_con_columna(self, columna: Columna, ahora) -> None:
        """En la columna final cuenta como terminada; fuera de ella, no."""
        if columna.es_final:
            self.completada_en = self.completada_en or ahora
        else:
            self.completada_en = None


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
    menciones = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="menciones_recibidas"
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    editado_en = models.DateTimeField(null=True, blank=True)
    eliminado = models.BooleanField(default=False)

    class Meta:
        db_table = "planificacion_comentario"
        ordering = ["creado_en", "id"]

    def __str__(self):
        return f"Comentario {self.pk} en card {self.card_id}"


class ItemChecklist(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="checklist")
    texto = models.CharField(max_length=300)
    hecho = models.BooleanField(default=False)
    orden = models.PositiveIntegerField(default=0)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    hecho_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "planificacion_item_checklist"
        ordering = ["orden", "id"]

    def __str__(self):
        return f"{'[x]' if self.hecho else '[ ]'} {self.texto}"


class Actividad(models.Model):
    """Historial de una card. Lo escribe el backend; nunca se edita."""

    class Accion(models.TextChoices):
        CREO = "creo", "Creó la tarjeta"
        MOVIO = "movio", "Movió la tarjeta"
        EDITO = "edito", "Editó un campo"
        ASIGNO = "asigno", "Asignó responsables"
        DESASIGNO = "desasigno", "Quitó responsables"
        COMENTO = "comento", "Comentó"
        CHECKLIST = "checklist", "Cambió el checklist"
        ARCHIVO = "archivo", "Archivó la tarjeta"
        RESTAURO = "restauro", "Restauró la tarjeta"
        TRASLADO = "traslado", "Trasladó la tarjeta de tablero"

    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="actividad")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    accion = models.CharField(max_length=12, choices=Accion.choices)
    detalle = models.JSONField(default=dict, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "planificacion_actividad"
        ordering = ["-creado_en", "-id"]

    def __str__(self):
        return f"{self.card_id} {self.accion}"
