from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from integracion_portal.services.personas import persona

from tableros import permisos
from tableros.models import (
    Actividad,
    Adjunto,
    CampoPersonalizado,
    Card,
    Columna,
    Comentario,
    EnGantt,
    Etiqueta,
    ItemChecklist,
    TIPOS_IMAGEN,
    Tablero,
    TipoCampo,
    Urgencia,
)
from tableros.services.adjuntos import es_imagen
from tableros.services.campos import validar_valores
from tableros.services.favoritos import ids_favoritos
from tableros.services.vencimientos import DIAS_HABILES_VENCE_PRONTO, vencimiento


def equipo_breve(equipo):
    if equipo is None:
        return None
    return {"id": equipo.pk, "nombre": equipo.nombre, "color": equipo.color}


# --- Columnas -------------------------------------------------------------------


class ColumnaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Columna
        fields = ["id", "nombre", "orden", "es_final", "incluir_en_gantt", "limite_cards", "version"]
        read_only_fields = ["id", "orden", "version"]


class ColumnaEscrituraSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=60, required=False, trim_whitespace=True)
    es_final = serializers.BooleanField(required=False)
    incluir_en_gantt = serializers.BooleanField(required=False)
    limite_cards = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=999)
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
    checklist = serializers.SerializerMethodField()
    tiene_descripcion = serializers.SerializerMethodField()
    vencimiento = serializers.SerializerMethodField()
    en_gantt_efectivo = serializers.BooleanField(source="entra_en_gantt", read_only=True)
    etiquetas = serializers.SerializerMethodField()
    num_adjuntos = serializers.SerializerMethodField()
    #: Id de la primera imagen adjunta (se muestra como portada) o null.
    portada = serializers.SerializerMethodField()

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
            "en_gantt_efectivo",
            "etiquetas",
            "campos",
            "responsables",
            "comentarios",
            "checklist",
            "num_adjuntos",
            "portada",
            "vencimiento",
            "completada_en",
            "version",
            "actualizado_en",
        ]

    def get_etiquetas(self, card):
        return [e.pk for e in card.etiquetas.all()]

    def get_responsables(self, card):
        return [persona(a.usuario) for a in card.asignaciones.all()]

    def get_comentarios(self, card):
        valor = getattr(card, "num_comentarios", None)
        if valor is None:
            valor = card.comentarios.filter(eliminado=False).count()
        return valor

    def get_num_adjuntos(self, card):
        valor = getattr(card, "num_adjuntos", None)
        return card.adjuntos.count() if valor is None else valor

    def get_portada(self, card):
        if hasattr(card, "id_portada"):
            return card.id_portada
        primera = card.adjuntos.filter(tipo__in=TIPOS_IMAGEN).order_by("creado_en", "id").values_list("id", flat=True).first()
        return primera

    def get_checklist(self, card):
        total = getattr(card, "num_items", None)
        if total is None:
            total = card.checklist.count()
            hechos = card.checklist.filter(hecho=True).count()
        else:
            hechos = card.num_items_hechos
        return {"hechos": hechos, "total": total}

    def get_tiene_descripcion(self, card):
        return bool(card.descripcion.strip())

    def get_vencimiento(self, card):
        return vencimiento(card, self.context.get("hoy"), self.context.get("umbral", DIAS_HABILES_VENCE_PRONTO))


class ItemChecklistSerializer(serializers.ModelSerializer):
    hecho_por = serializers.SerializerMethodField()

    class Meta:
        model = ItemChecklist
        fields = ["id", "texto", "hecho", "orden", "hecho_por"]

    def get_hecho_por(self, item):
        return persona(item.hecho_por) if item.hecho else None


class ActividadSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = Actividad
        fields = ["id", "actor", "accion", "detalle", "creado_en"]

    def get_actor(self, actividad):
        return persona(actividad.actor)


class AdjuntoSerializer(serializers.ModelSerializer):
    subido_por = serializers.SerializerMethodField()
    #: Se puede mostrar dentro de la tarjeta (`adjuntos/<id>/?ver=1`).
    es_imagen = serializers.SerializerMethodField()

    class Meta:
        model = Adjunto
        fields = ["id", "nombre", "tipo", "tamano", "es_imagen", "subido_por", "creado_en"]

    def get_es_imagen(self, adjunto):
        return es_imagen(adjunto.tipo)

    def get_subido_por(self, adjunto):
        return persona(adjunto.subido_por)


class CardDetalleSerializer(CardResumenSerializer):
    items = serializers.SerializerMethodField()
    adjuntos = serializers.SerializerMethodField()
    creada_por = serializers.SerializerMethodField()
    tablero = serializers.SerializerMethodField()
    columna_nombre = serializers.CharField(source="columna.nombre")
    permisos = serializers.SerializerMethodField()

    class Meta(CardResumenSerializer.Meta):
        fields = CardResumenSerializer.Meta.fields + [
            "descripcion",
            "items",
            "adjuntos",
            "creada_por",
            "creado_en",
            "tablero",
            "columna_nombre",
            "archivada",
            "permisos",
        ]

    def get_items(self, card):
        return ItemChecklistSerializer(card.checklist.select_related("hecho_por"), many=True).data

    def get_adjuntos(self, card):
        return AdjuntoSerializer(card.adjuntos.sin_contenido().select_related("subido_por"), many=True).data

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
    etiquetas = serializers.ListField(child=serializers.IntegerField(), required=False, max_length=30)
    campos = serializers.DictField(required=False)
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
            permitidos = {u.pk: u for u in tablero.personas_asignables()}
            ids = list(dict.fromkeys(datos["responsables"]))
            ajenos = [i for i in ids if i not in permitidos]
            if ajenos:
                raise serializers.ValidationError(
                    {"responsables": "Solo puedes asignar a personas de este tablero."}
                )
            datos["responsables"] = [permitidos[i] for i in ids]
        if "columna" in datos:
            columna = self.context["tablero"].columnas.activas().filter(pk=datos["columna"]).first()
            if columna is None:
                raise serializers.ValidationError({"columna": "La columna no existe en este tablero."})
            datos["columna"] = columna
        if "etiquetas" in datos:
            tablero = self.context["tablero"]
            permitidas = {e.pk: e for e in tablero.etiquetas.all()}
            ids = list(dict.fromkeys(datos["etiquetas"]))
            if any(i not in permitidas for i in ids):
                raise serializers.ValidationError({"etiquetas": "Esa etiqueta no es de este tablero."})
            datos["etiquetas"] = [permitidas[i] for i in ids]
        if "campos" in datos:
            # Mismo nombre que el parámetro del servicio.
            datos["valores_campos"] = validar_valores(self.context["tablero"], datos.pop("campos"))
        return datos


# --- Etiquetas y campos personalizados ------------------------------------------------------


class EtiquetaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Etiqueta
        fields = ["id", "nombre", "color", "orden", "es_hito"]


class EtiquetaEscrituraSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=40, required=False)
    color = serializers.CharField(max_length=7, required=False)
    es_hito = serializers.BooleanField(required=False)


class CampoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampoPersonalizado
        fields = ["id", "nombre", "tipo", "opciones", "orden", "visible_en_tarjeta", "archivado"]


class CampoEscrituraSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=60, required=False)
    tipo = serializers.ChoiceField(choices=TipoCampo.choices, required=False)
    opciones = serializers.ListField(child=serializers.CharField(max_length=60), required=False, max_length=30)
    #: {opción vieja: nueva}: las tarjetas que tenían la vieja pasan a la nueva.
    renombrar = serializers.DictField(child=serializers.CharField(max_length=60), required=False)
    visible_en_tarjeta = serializers.BooleanField(required=False)
    orden = serializers.IntegerField(required=False, min_value=0)
    archivado = serializers.BooleanField(required=False)


# --- Comentarios ------------------------------------------------------------------


class ComentarioSerializer(serializers.ModelSerializer):
    autor = serializers.SerializerMethodField()
    texto = serializers.SerializerMethodField()
    menciones = serializers.SerializerMethodField()
    es_mio = serializers.SerializerMethodField()

    class Meta:
        model = Comentario
        fields = ["id", "autor", "texto", "menciones", "eliminado", "creado_en", "editado_en", "es_mio"]

    def get_menciones(self, comentario):
        if comentario.eliminado:
            return []
        return [persona(u) for u in comentario.menciones.all()]

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
    es_favorito = serializers.SerializerMethodField()

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
            "es_favorito",
            "actualizado_en",
        ]

    def get_es_favorito(self, tablero):
        # Una consulta por respuesta, no por tablero: el contexto lo comparten
        # todos los elementos de una lista (`many=True`).
        if "favoritos" not in self.context:
            self.context["favoritos"] = ids_favoritos(self.context["request"].user)
        return tablero.pk in self.context["favoritos"]

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
        fields = TableroResumenSerializer.Meta.fields + [
            "columnas",
            "cards",
            "personas",
            "mi_rol",
            "etiquetas",
            "campos",
            "ayuda",
        ]

    etiquetas = serializers.SerializerMethodField()
    campos = serializers.SerializerMethodField()
    #: Guía propia del Centro de ayuda (de su plantilla) o null.
    ayuda = serializers.SerializerMethodField()

    def get_ayuda(self, tablero):
        return tablero.ayuda or None

    def get_etiquetas(self, tablero):
        return EtiquetaSerializer(tablero.etiquetas.all(), many=True).data

    def get_campos(self, tablero):
        """Todos, archivados incluidos (para gestionarlos); la interfaz usa los activos."""
        return CampoSerializer(tablero.campos.all(), many=True).data

    def get_columnas(self, tablero):
        return ColumnaSerializer(tablero.columnas_activas, many=True).data

    def get_cards(self, tablero):
        return CardResumenSerializer(tablero.cards_activas, many=True, context=self.context).data

    def get_personas(self, tablero):
        return [persona(u) for u in tablero.personas_asignables()]

    def get_mi_rol(self, tablero):
        if tablero.es_personal:
            return "propietario"
        m = permisos.membresia(self.context["request"].user, tablero.equipo)
        return m.rol if m else None


class TableroEscrituraSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=100, required=False)
    descripcion = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    equipo = serializers.IntegerField(required=False, allow_null=True)

    def validate_nombre(self, valor):
        if not valor.strip():
            raise serializers.ValidationError("El nombre no puede quedar vacío.")
        return valor.strip()



# --- Mis tareas -------------------------------------------------------------------


class MisTareaSerializer(CardResumenSerializer):
    """Tarjeta de «Mis tareas»: lleva de qué tablero y columna viene."""

    def to_representation(self, card):
        datos = super().to_representation(card)
        t = card.tablero
        datos["tablero"] = {"id": t.pk, "nombre": t.nombre, "tipo": t.tipo, "equipo": equipo_breve(t.equipo)}
        datos["columna_nombre"] = card.columna.nombre
        return datos
