"""
API de tableros, columnas, cards y comentarios (`/api/v1/`).

Convenciones (docs/plan-modulo-planificacion.md §3.1 y §8):
- 403 si la persona no puede ver o no puede hacer la acción; 404 si no existe.
- 409 si la `version` enviada está vieja: la respuesta trae el estado actual.
- 400 con `detail` para reglas de negocio (`ReglaDeNegocio`).
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Count, F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from equipos.models import Equipo

from . import permisos, servicios
from .models import Card, Columna, Comentario, Tablero, TipoTablero
from .serializers import (
    CardDetalleSerializer,
    CardEscrituraSerializer,
    CardResumenSerializer,
    ColumnaEscrituraSerializer,
    ColumnaSerializer,
    ComentarioEscrituraSerializer,
    ComentarioSerializer,
    TableroDetalleSerializer,
    TableroEscrituraSerializer,
    TableroResumenSerializer,
    equipo_breve,
)

SIN_ACCESO = "No tienes acceso a este tablero."
SIN_PERMISO_EDITAR = "Solo puedes consultar este tablero."
SIN_PERMISO_GESTIONAR = "Solo los administradores del equipo pueden cambiar esto."


def _contexto(request):
    return {"request": request, "hoy": timezone.localdate()}


def _booleano(request, campo: str, defecto: bool) -> bool:
    """Lee un booleano del cuerpo sin la trampa de `bool("false") is True`."""
    if campo not in request.data:
        return defecto
    campo_bool = serializers.BooleanField()
    try:
        return campo_bool.to_internal_value(request.data[campo])
    except serializers.ValidationError:
        raise ValidationError({campo: "Debe ser verdadero o falso."})


def _regla(exc: servicios.ReglaDeNegocio):
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


def _conflicto(card_o_columna, serializer_cls, request):
    return Response(
        {
            "detail": "Otra persona cambió esto mientras lo editabas. Se cargó la versión actual.",
            "actual": serializer_cls(card_o_columna, context=_contexto(request)).data,
        },
        status=status.HTTP_409_CONFLICT,
    )


def obtener_tablero(request, pk, *, editar=False, gestionar=False) -> Tablero:
    tablero = get_object_or_404(Tablero.objects.select_related("equipo", "propietario"), pk=pk)
    usuario = request.user
    if not permisos.puede_ver_tablero(usuario, tablero):
        raise PermissionDenied(SIN_ACCESO)
    if editar and not permisos.puede_editar_tablero(usuario, tablero):
        raise PermissionDenied(SIN_PERMISO_EDITAR)
    if gestionar and not permisos.puede_gestionar_tablero(usuario, tablero):
        raise PermissionDenied(SIN_PERMISO_GESTIONAR)
    return tablero


def obtener_card(request, pk, *, editar=False) -> Card:
    card = get_object_or_404(
        Card.objects.select_related("tablero__equipo", "tablero__propietario", "columna", "creada_por"),
        pk=pk,
    )
    obtener_tablero(request, card.tablero_id, editar=editar)
    return card


def _cards_con_detalle(qs):
    return (
        qs.select_related("columna", "creada_por", "tablero__equipo")
        .prefetch_related("asignaciones__usuario__disciplina")
        .annotate(
            num_comentarios=Count(
                "comentarios", filter=Q(comentarios__eliminado=False), distinct=True
            )
        )
    )


def _detalle_tablero(request, tablero):
    tablero.columnas_activas = list(servicios.columnas_activas(tablero))
    tablero.cards_activas = list(
        _cards_con_detalle(
            tablero.cards.filter(archivada=False, columna__archivada=False)
        ).order_by("orden", "id")
    )
    return TableroDetalleSerializer(tablero, context=_contexto(request)).data


def _detalle_card(request, card):
    card = _cards_con_detalle(Card.objects.filter(pk=card.pk)).get()
    return CardDetalleSerializer(card, context=_contexto(request)).data


# --- Tableros -------------------------------------------------------------------


class TablerosView(APIView):
    def get(self, request):
        usuario = request.user
        servicios.asegurar_tablero_personal(usuario)
        qs = (
            Tablero.objects.filter(archivado=False)
            .filter(
                Q(tipo=TipoTablero.PERSONAL, propietario=usuario)
                | Q(
                    tipo=TipoTablero.EQUIPO,
                    equipo__archivado=False,
                    equipo__miembros__usuario=usuario,
                )
            )
            .select_related("equipo")
            .distinct()
            .order_by("tipo", "equipo__nombre", "nombre")
        )
        return Response(TableroResumenSerializer(qs, many=True, context=_contexto(request)).data)

    def post(self, request):
        datos = TableroEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        if not datos.get("nombre"):
            raise ValidationError({"nombre": "Ponle un nombre al tablero."})
        equipo = get_object_or_404(Equipo, pk=datos.get("equipo"), archivado=False)
        if not permisos.puede_administrar_equipo(request.user, equipo):
            raise PermissionDenied("Solo los administradores del equipo pueden crear tableros.")
        tablero = servicios.crear_tablero(
            nombre=datos["nombre"],
            descripcion=datos.get("descripcion", ""),
            tipo=TipoTablero.EQUIPO,
            equipo=equipo,
            creado_por=request.user,
        )
        return Response(_detalle_tablero(request, tablero), status=status.HTTP_201_CREATED)


class TableroDetalleView(APIView):
    def get(self, request, pk):
        return Response(_detalle_tablero(request, obtener_tablero(request, pk)))

    def patch(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        datos = TableroEscrituraSerializer(data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        for campo in ("nombre", "descripcion"):
            if campo in datos.validated_data:
                setattr(tablero, campo, datos.validated_data[campo])
        tablero.save()
        return Response(_detalle_tablero(request, tablero))


class TableroArchivarView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        if tablero.es_personal:
            return Response(
                {"detail": "El tablero personal no se puede archivar."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tablero.archivado = _booleano(request, "archivado", True)
        tablero.save(update_fields=["archivado", "actualizado_en"])
        return Response(TableroResumenSerializer(tablero, context=_contexto(request)).data)


class TableroCardsArchivadasView(APIView):
    def get(self, request, pk):
        tablero = obtener_tablero(request, pk)
        qs = _cards_con_detalle(tablero.cards.filter(archivada=True)).order_by("-archivada_en")
        return Response(CardDetalleSerializer(qs[:100], many=True, context=_contexto(request)).data)


# --- Columnas -------------------------------------------------------------------


class ColumnasView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        nombre = (request.data.get("nombre") or "").strip()
        if not nombre:
            raise ValidationError({"nombre": "Ponle un nombre a la columna."})
        columna = servicios.crear_columna(tablero, nombre[:60])
        return Response(ColumnaSerializer(columna).data, status=status.HTTP_201_CREATED)


class ColumnasReordenarView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        ids = request.data.get("orden")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            raise ValidationError({"orden": "Envía la lista de ids de columnas."})
        try:
            servicios.reordenar_columnas(tablero, ids)
        except servicios.ReglaDeNegocio as exc:
            return _regla(exc)
        return Response(ColumnaSerializer(servicios.columnas_activas(tablero), many=True).data)


def _obtener_columna(request, pk) -> Columna:
    columna = get_object_or_404(Columna, pk=pk, archivada=False)
    obtener_tablero(request, columna.tablero_id, gestionar=True)
    return columna


class ColumnaDetalleView(APIView):
    def patch(self, request, pk):
        columna = _obtener_columna(request, pk)
        datos = ColumnaEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        with transaction.atomic():
            columna = Columna.objects.select_for_update().get(pk=columna.pk)
            if datos["version"] != columna.version:
                return _conflicto(columna, lambda c, context: ColumnaSerializer(c), request)
            if "es_final" in datos and datos["es_final"] != columna.es_final:
                servicios.marcar_final(columna, datos["es_final"])
            for campo in ("nombre", "incluir_en_gantt"):
                if campo in datos:
                    setattr(columna, campo, datos[campo])
            columna.version += 1
            columna.save()
        return Response(ColumnaSerializer(columna).data)


class ColumnaArchivarView(APIView):
    def post(self, request, pk):
        columna = _obtener_columna(request, pk)
        destino = None
        if request.data.get("mover_a") is not None:
            destino = get_object_or_404(Columna, pk=request.data["mover_a"])
        try:
            servicios.archivar_columna(columna, destino)
        except servicios.ReglaDeNegocio as exc:
            return _regla(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Cards ----------------------------------------------------------------------


CAMPOS_SIMPLES = ("titulo", "descripcion", "fecha_inicio", "fecha_fin", "urgencia", "en_gantt")


class CardsView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, editar=True)
        datos = CardEscrituraSerializer(data=request.data, context={"tablero": tablero})
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        if not datos.get("titulo"):
            raise ValidationError({"titulo": "Escribe un título para la tarjeta."})
        activas = servicios.columnas_activas(tablero)
        columna = activas.filter(pk=datos["columna"]).first() if "columna" in datos else activas.first()
        if columna is None:
            raise ValidationError({"columna": "La columna no existe en este tablero."})
        campos = {c: datos[c] for c in CAMPOS_SIMPLES if c in datos and c != "titulo"}
        card = servicios.crear_card(
            tablero=tablero,
            columna=columna,
            titulo=datos["titulo"],
            creada_por=request.user,
            responsables=datos.get("responsables", []),
            **campos,
        )
        return Response(_detalle_card(request, card), status=status.HTTP_201_CREATED)


class CardPorNumeroView(APIView):
    """`/tableros/<id>/cards/<numero>/`: la URL que ve el usuario (deep link)."""

    def get(self, request, pk, numero):
        tablero = obtener_tablero(request, pk)
        card = get_object_or_404(Card, tablero=tablero, numero=numero)
        return Response(_detalle_card(request, card))


class CardDetalleView(APIView):
    def get(self, request, pk):
        return Response(_detalle_card(request, obtener_card(request, pk)))

    def patch(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        datos = CardEscrituraSerializer(
            data=request.data, context={"tablero": card.tablero, "card": card}, partial=True
        )
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        if "version" not in datos:
            raise ValidationError({"version": "Falta la versión de la tarjeta."})
        with transaction.atomic():
            actual = Card.objects.select_for_update().get(pk=card.pk)
            if datos["version"] != actual.version:
                return _conflicto(
                    _cards_con_detalle(Card.objects.filter(pk=card.pk)).get(),
                    CardDetalleSerializer,
                    request,
                )
            for campo in CAMPOS_SIMPLES:
                if campo in datos:
                    setattr(actual, campo, datos[campo])
            if "responsables" in datos:
                servicios.asignar_responsables(actual, datos["responsables"], por=request.user)
            actual.version += 1
            actual.save()
            if "columna" in datos and datos["columna"] != actual.columna_id:
                destino = servicios.columnas_activas(actual.tablero).filter(pk=datos["columna"]).first()
                if destino is None:
                    raise ValidationError({"columna": "La columna no existe en este tablero."})
                servicios.mover_card(actual, destino, posicion=10**6)
        return Response(_detalle_card(request, actual))


class CardMoverView(APIView):
    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        destino = get_object_or_404(Columna, pk=request.data.get("columna"))
        try:
            posicion = int(request.data.get("posicion", 0))
        except (TypeError, ValueError):
            raise ValidationError({"posicion": "Posición inválida."})
        try:
            servicios.mover_card(card, destino, posicion)
        except servicios.ReglaDeNegocio as exc:
            return _regla(exc)
        return Response(_detalle_card(request, card))


class CardArchivarView(APIView):
    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        if _booleano(request, "archivada", True):
            servicios.archivar_card(card)
        else:
            servicios.restaurar_card(card)
        return Response(_detalle_card(request, card))


# --- Comentarios ------------------------------------------------------------------


class ComentariosView(APIView):
    def get(self, request, pk):
        card = obtener_card(request, pk)
        qs = card.comentarios.select_related("autor__disciplina")
        return Response(ComentarioSerializer(qs, many=True, context=_contexto(request)).data)

    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        datos = ComentarioEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        comentario = Comentario.objects.create(
            card=card, autor=request.user, texto=datos.validated_data["texto"]
        )
        return Response(
            ComentarioSerializer(comentario, context=_contexto(request)).data,
            status=status.HTTP_201_CREATED,
        )


class ComentarioDetalleView(APIView):
    def _propio(self, request, pk) -> Comentario:
        comentario = get_object_or_404(Comentario, pk=pk, eliminado=False)
        obtener_card(request, comentario.card_id, editar=True)
        if comentario.autor_id != request.user.pk:
            raise PermissionDenied("Solo puedes cambiar tus propios comentarios.")
        return comentario

    def patch(self, request, pk):
        comentario = self._propio(request, pk)
        datos = ComentarioEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        comentario.texto = datos.validated_data["texto"]
        comentario.editado_en = timezone.now()
        comentario.save(update_fields=["texto", "editado_en"])
        return Response(ComentarioSerializer(comentario, context=_contexto(request)).data)

    def delete(self, request, pk):
        comentario = self._propio(request, pk)
        comentario.eliminado = True
        comentario.save(update_fields=["eliminado"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Mis tareas -------------------------------------------------------------------


class MisTareaSerializer(CardResumenSerializer):
    def to_representation(self, card):
        datos = super().to_representation(card)
        t = card.tablero
        datos["tablero"] = {
            "id": t.pk,
            "nombre": t.nombre,
            "tipo": t.tipo,
            "equipo": equipo_breve(t.equipo),
        }
        datos["columna_nombre"] = card.columna.nombre
        return datos


class MisTareasView(APIView):
    """Cards abiertas donde soy responsable, de todos los tableros que puedo ver."""

    def get(self, request):
        usuario = request.user
        qs = (
            Card.objects.filter(
                asignaciones__usuario=usuario,
                archivada=False,
                completada_en__isnull=True,
                columna__archivada=False,
                tablero__archivado=False,
            )
            .filter(
                Q(tablero__tipo=TipoTablero.PERSONAL, tablero__propietario=usuario)
                | Q(
                    tablero__tipo=TipoTablero.EQUIPO,
                    tablero__equipo__archivado=False,
                    tablero__equipo__miembros__usuario=usuario,
                )
            )
            .distinct()
        )
        qs = _cards_con_detalle(qs).order_by(F("fecha_fin").asc(nulls_last=True), "id")
        return Response(MisTareaSerializer(qs[:300], many=True, context=_contexto(request)).data)
