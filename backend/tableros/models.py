"""
Tableros, columnas, cards y comentarios.

Reglas que viven aquí (y no en el frontend):
- Un tablero es `personal` (privado; cada persona puede tener varios y el
  primero, «Mi tablero», se crea solo) o de `equipo`.
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
from django.db.models import Count, F, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce


class TipoTablero(models.TextChoices):
    PERSONAL = "personal", "Personal"
    EQUIPO = "equipo", "Equipo"


class Urgencia(models.TextChoices):
    BAJA = "baja", "Baja"
    MEDIA = "media", "Media"
    ALTA = "alta", "Alta"
    CRITICA = "critica", "Crítica"


class EnGantt(models.TextChoices):
    """Regla por card para la vista Gantt: sí, no o lo que diga su columna."""

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
    #: Guía propia para el Centro de ayuda (la trae su plantilla): {titulo,
    #: resumen, entradas}. Vacía en la mayoría de los tableros.
    ayuda = models.JSONField(default=dict, blank=True)
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


class TableroFavorito(models.Model):
    """Tablero marcado como favorito por una persona (solo lo ve ella).

    No da acceso: si la persona deja de ver el tablero (sale del equipo), la
    marca queda pero el tablero no aparece, porque los listados parten de
    `Tablero.objects.visibles_para`."""

    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tableros_favoritos")
    tablero = models.ForeignKey(Tablero, on_delete=models.CASCADE, related_name="favoritos")
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "planificacion_tablero_favorito"
        constraints = [models.UniqueConstraint(fields=["usuario", "tablero"], name="favorito_unico_por_usuario")]

    def __str__(self):
        return f"{self.usuario} ★ {self.tablero}"


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
    # Límite de trabajo en curso (fase 5). Suave: la columna avisa al pasarse
    # pero no bloquea (D-13). Vacío = sin límite.
    limite_cards = models.PositiveSmallIntegerField(null=True, blank=True)
    archivada = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=1)
    creado_en = models.DateTimeField(auto_now_add=True)

    objects = ColumnaQuerySet.as_manager()

    class Meta:
        db_table = "planificacion_columna"
        ordering = ["orden", "id"]

    def __str__(self):
        return f"{self.tablero_id}/{self.nombre}"


class Etiqueta(models.Model):
    """Etiqueta de un tablero (fase 5): disciplina, cliente, tipo de tarea…"""

    tablero = models.ForeignKey(Tablero, on_delete=models.CASCADE, related_name="etiquetas")
    nombre = models.CharField(max_length=40)
    color = models.CharField(max_length=7, default="#2563eb")
    orden = models.PositiveIntegerField(default=0)
    #: Las tarjetas con esta etiqueta son hitos: un rombo en el Gantt y en su
    #: PDF, y «Milestone» en MS Project. Se marca a mano, no por el nombre.
    es_hito = models.BooleanField(default=False)

    class Meta:
        db_table = "planificacion_etiqueta"
        ordering = ["orden", "id"]
        constraints = [
            models.UniqueConstraint(fields=["tablero", "nombre"], name="etiqueta_unica_por_tablero"),
        ]

    def __str__(self):
        return self.nombre


class TipoCampo(models.TextChoices):
    TEXTO = "texto", "Texto"
    NUMERO = "numero", "Número"
    LISTA = "lista", "Lista"


class CampoPersonalizado(models.Model):
    """Campo propio de un tablero (fase 5). Los valores viven en `Card.campos`
    (JSON por id de campo). Se archiva, no se borra: sus valores se conservan."""

    tablero = models.ForeignKey(Tablero, on_delete=models.CASCADE, related_name="campos")
    nombre = models.CharField(max_length=60)
    tipo = models.CharField(max_length=10, choices=TipoCampo.choices)
    #: Solo para `lista`: las opciones posibles, en orden.
    opciones = models.JSONField(default=list, blank=True)
    orden = models.PositiveIntegerField(default=0)
    visible_en_tarjeta = models.BooleanField(default=False, help_text="Se ve en la tarjeta del Kanban.")
    archivado = models.BooleanField(default=False)

    class Meta:
        db_table = "planificacion_campo_personalizado"
        ordering = ["orden", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tablero", "nombre"],
                condition=Q(archivado=False),
                name="campo_activo_unico_por_tablero",
            ),
        ]

    def __str__(self):
        return f"{self.nombre} ({self.tipo})"


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
        """Todo lo que pinta una tarjeta, sin consultas por card.

        Los conteos van en subconsultas: con JOIN + COUNT DISTINCT, una
        tarjeta con muchos comentarios y muchos ítems multiplicaba las filas
        (comentarios × ítems) antes de agrupar."""

        def contar(consulta):
            por_card = consulta.filter(card=OuterRef("pk")).order_by().values("card").annotate(n=Count("id")).values("n")
            return Coalesce(Subquery(por_card[:1], output_field=models.IntegerField()), Value(0))

        # La portada es la primera imagen adjunta (la más antigua), como la
        # primera miniatura de la tarjeta abierta.
        portada = Adjunto.objects.filter(card=OuterRef("pk"), tipo__in=TIPOS_IMAGEN).order_by("creado_en", "id").values("id")

        return self.select_related("columna", "creada_por", "tablero__equipo", "tablero__propietario").prefetch_related(
            "asignaciones__usuario__disciplina", "etiquetas"
        ).annotate(
            num_comentarios=contar(Comentario.objects.filter(eliminado=False)),
            num_items=contar(ItemChecklist.objects.all()),
            num_items_hechos=contar(ItemChecklist.objects.filter(hecho=True)),
            num_adjuntos=contar(Adjunto.objects.all()),
            id_portada=Subquery(portada[:1], output_field=models.IntegerField()),
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
    etiquetas = models.ManyToManyField(Etiqueta, blank=True, related_name="cards", db_table="planificacion_card_etiqueta")
    #: Valores de los campos personalizados: {"<id del campo>": valor}.
    campos = models.JSONField(default=dict, blank=True)
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

    @property
    def entra_en_gantt(self) -> bool:
        """Regla de inclusión (§7 fase 3): la card manda; si hereda, su columna."""
        if self.en_gantt == EnGantt.HEREDAR:
            return self.columna.incluir_en_gantt
        return self.en_gantt == EnGantt.SI

    @property
    def es_hito(self) -> bool:
        """Tiene alguna etiqueta de hito (usa las etiquetas ya precargadas)."""
        return any(e.es_hito for e in self.etiquetas.all())

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


#: Adjuntos que se muestran como imagen (miniatura y portada de la tarjeta). Sus
#: firmas, para comprobar el contenido, están en `services/adjuntos.py`.
TIPOS_IMAGEN = ("image/png", "image/jpeg", "image/gif", "image/webp")


class AdjuntoQuerySet(models.QuerySet):
    def sin_contenido(self):
        """Para listar: sin traer los archivos de la base."""
        return self.defer("contenido", "miniatura")


class Adjunto(models.Model):
    """Archivo adjunto a una tarjeta. El contenido vive en la base (D-16): el
    despliegue no necesita un volumen y el respaldo de la base lo incluye. A
    cambio, el tamaño está acotado (`services/adjuntos.py`)."""

    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="adjuntos")
    nombre = models.CharField(max_length=200)
    #: Tipo MIME deducido del nombre (no el que dice el navegador).
    tipo = models.CharField(max_length=100, blank=True)
    #: Bytes guardados (una imagen, ya reducida).
    tamano = models.PositiveIntegerField()
    contenido = models.BinaryField()
    #: JPEG pequeño de una imagen, para la cuadrícula y la portada (null: no es
    #: imagen, no se pudo leer o se subió antes de que existieran).
    miniatura = models.BinaryField(null=True, blank=True)
    #: SHA-256 de lo que se subió: para no adjuntar dos veces el mismo archivo.
    huella = models.CharField(max_length=64, blank=True, db_index=True)
    subido_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    creado_en = models.DateTimeField(auto_now_add=True)

    objects = AdjuntoQuerySet.as_manager()

    class Meta:
        db_table = "planificacion_adjunto"
        ordering = ["creado_en", "id"]

    def __str__(self):
        return self.nombre


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
        DEPENDENCIA = "dependencia", "Cambió una dependencia"
        ADJUNTO = "adjunto", "Cambió un adjunto"

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
