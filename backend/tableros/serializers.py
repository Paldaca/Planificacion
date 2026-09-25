from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from integracion_portal.personas import persona

from . import permisos
from .models import Card, Columna, Comentario, EnGantt, Tablero, Urgencia
from .servicios import vencimiento


def equipo_breve(equipo):
    if equipo is None:
        return None
    return {"id": equipo.pk, "nombre": equipo.nombre, "color": equipo.color}


def personas_asignables(tablero) -> list:
    """Quién puede ser responsable: el dueño (personal) o los miembros del equipo."""
    if tablero.es_personal:
        return [tablero.propietario]
    return [
        m.usuario
        for m in tablero.equipo.miembros.select_related("usuario__disciplina").order_by(
            "usuario__first_name", "usuario__last_name"
        )
    ]


# --- Columnas -------------------------------------------------------------------


class ColumnaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Columna
        fields = ["id", "nombre", "orden", "es_final", "incluir_en_gantt", "version"]
        read_only_fields = ["id", "orden", "version"]


class ColumnaEscrituraSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=60, required=False, trim_whitespace=True)
    es_final = serializers.BooleanField(required=False)
    incluir_en_gantt = serializers.BooleanField(required=False)
    version = serializers.IntegerField(min_value=1)

    def validate_nombre(self, valor):
        if not valor.strip():
            raise serializers.ValidationError("El nombre no puede quedar vacío.")
        return valor.strip()


# --- Cards ----------------------------------------------------------------------


class CardResumenSerializer(serializers.ModelSerializer):
    """Lo que pinta una tarjeta en el tablero y en Mis tareas."""

    columna = serializers.IntegerField(source="columna_id")
    responsables = serializers.SerializerMethodField()
    comentarios = serializers.SerializerMethodField()
    tiene_descripcion = serializers.SerializerMethodField()
    vencimiento = serializers.SerializerMethodField()

    class Meta:
        model = Card
        fields = [
            "id",
            "numero",
            "titulo",
            "tiene_descripcion",
            "fecha_inicio",
            "fecha_fin",
            "urgencia",
            "columna",
            "orden",
            "en_gantt",
            "responsables",
            "comentarios",
            "vencimiento",
            "completada_en",
            "version",
            "actualizado_en",
        ]

    def get_responsables(self, card):
        return [persona(a.usuario) for a in card.asignaciones.all()]

    def get_comentarios(self, card):
        valor = getattr(card, "num_comentarios", None)
        if valor is None:
            valor = card.comentarios.filter(eliminado=False).count()
        return valor

    def get_tiene_descripcion(self, card):
        return bool(card.descripcion.strip())

    def get_vencimiento(self, card):
        return vencimiento(card, self.context.get("hoy"))


class CardDetalleSerializer(CardResumenSerializer):
    creada_por = serializers.SerializerMethodField()
    tablero = serializers.SerializerMethodField()
    columna_nombre = serializers.CharField(source="columna.nombre")
    permisos = serializers.SerializerMethodField()

    class Meta(CardResumenSerializer.Meta):
        fields = CardResumenSerializer.Meta.fields + [
            "descripcion",
            "creada_por",
            "creado_en",
            "tablero",
            "columna_nombre",
            "archivada",
            "permisos",
        ]

    def get_creada_por(self, card):
        return persona(card.creada_por)

    def get_tablero(self, card):
        t = card.tablero
        return {"id": t.pk, "nombre": t.nombre, "tipo": t.tipo, "equipo": equipo_breve(t.equipo)}

    def get_permisos(self, card):
        return {"editar": permisos.puede_editar_tablero(self.context["request"].user, card.tablero)}


class CardEscrituraSerializer(serializers.Serializer):
    titulo = serializers.CharField(max_length=200, required=False)
    descripcion = serializers.CharField(max_length=10000, required=False, allow_blank=True)
    fecha_inicio = serializers.DateField(required=False, allow_null=True)
    fecha_fin = serializers.DateField(required=False, allow_null=True)
    urgencia = serializers.ChoiceField(choices=Urgencia.choices, required=False)
    en_gantt = serializers.ChoiceField(choices=EnGantt.choices, required=False)
    responsables = serializers.ListField(
        child=serializers.IntegerField(), required=False, max_length=30
    )
    columna = serializers.IntegerField(required=False)
    version = serializers.IntegerField(required=False, min_value=1)

    def validate_titulo(self, valor):
        if not valor.strip():
            raise serializers.ValidationError("El título no puede quedar vacío.")
        return valor.strip()

    def validate(self, datos):
        card = self.context.get("card")
        inicio = datos.get("fecha_inicio", card.fecha_inicio if card else None)
        fin = datos.get("fecha_fin", card.fecha_fin if card else None)
        if inicio and fin and fin < inicio:
            raise serializers.ValidationError(
                {"fecha_fin": "La fecha final no puede ser anterior a la de inicio."}
            )
        if "responsables" in datos:
            tablero = self.context["tablero"]
            permitidos = {u.pk: u for u in personas_asignables(tablero)}
            ids = list(dict.fromkeys(datos["responsables"]))
            ajenos = [i for i in ids if i not in permitidos]
            if ajenos:
                raise serializers.ValidationError(
                    {"responsables": "Solo puedes asignar a personas de este tablero."}
                )
            datos["responsables"] = [permitidos[i] for i in ids]
        return datos


# --- Comentarios ------------------------------------------------------------------


class ComentarioSerializer(serializers.ModelSerializer):
    autor = serializers.SerializerMethodField()
    texto = serializers.SerializerMethodField()
    es_mio = serializers.SerializerMethodField()

    class Meta:
        model = Comentario
        fields = ["id", "autor", "texto", "eliminado", "creado_en", "editado_en", "es_mio"]

    def get_autor(self, comentario):
        return persona(comentario.autor)

    def get_texto(self, comentario):
        return "" if comentario.eliminado else comentario.texto

    def get_es_mio(self, comentario):
        return comentario.autor_id == self.context["request"].user.pk


class ComentarioEscrituraSerializer(serializers.Serializer):
    texto = serializers.CharField(max_length=5000)

    def validate_texto(self, valor):
        if not valor.strip():
            raise serializers.ValidationError("El comentario está vacío.")
        return valor.strip()


# --- Tableros ---------------------------------------------------------------------


class TableroResumenSerializer(serializers.ModelSerializer):
    equipo = serializers.SerializerMethodField()
    conteos = serializers.SerializerMethodField()
    permisos = serializers.SerializerMethodField()

    class Meta:
        model = Tablero
        fields = [
            "id",
            "nombre",
            "descripcion",
            "tipo",
            "equipo",
            "archivado",
            "conteos",
            "permisos",
            "actualizado_en",
        ]

    def get_equipo(self, tablero):
        return equipo_breve(tablero.equipo)

    def get_conteos(self, tablero):
        hoy = self.context.get("hoy") or timezone.localdate()
        abiertas = tablero.cards.filter(archivada=False, completada_en__isnull=True)
        return {
            "abiertas": abiertas.count(),
            "vencidas": abiertas.filter(fecha_fin__lt=hoy).count(),
            "terminadas": tablero.cards.filter(archivada=False, completada_en__isnull=False).count(),
        }

    def get_permisos(self, tablero):
        return permisos.permisos_tablero(self.context["request"].user, tablero)


class TableroDetalleSerializer(TableroResumenSerializer):
    columnas = serializers.SerializerMethodField()
    cards = serializers.SerializerMethodField()
    personas = serializers.SerializerMethodField()
    mi_rol = serializers.SerializerMethodField()

    class Meta(TableroResumenSerializer.Meta):
        fields = TableroResumenSerializer.Meta.fields + ["columnas", "cards", "personas", "mi_rol"]

    def get_columnas(self, tablero):
        return ColumnaSerializer(tablero.columnas_activas, many=True).data

    def get_cards(self, tablero):
        return CardResumenSerializer(tablero.cards_activas, many=True, context=self.context).data

    def get_personas(self, tablero):
        return [persona(u) for u in personas_asignables(tablero)]

    def get_mi_rol(self, tablero):
        if tablero.es_personal:
            return "propietario"
        m = permisos.membresia(self.context["request"].user, tablero.equipo)
        return m.rol if m else None


class TableroEscrituraSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=100, required=False)
    descripcion = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    equipo = serializers.IntegerField(required=False)

    def validate_nombre(self, valor):
        if not valor.strip():
            raise serializers.ValidationError("El nombre no puede quedar vacío.")
        return valor.strip()

