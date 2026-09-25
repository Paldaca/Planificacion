from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import booleano
from core.errores import ConflictoDeVersion
from tableros import permisos
from tableros.models import Card, Columna, Tablero
from tableros.services import tarjetas as servicio

from ..serializers import ActividadSerializer, CardEscrituraSerializer
from .comunes import conflicto, detalle_card, obtener_card, obtener_tablero


class CardsView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, editar=True)
        datos = CardEscrituraSerializer(data=request.data, context={"tablero": tablero})
        datos.is_valid(raise_exception=True)
        datos = dict(datos.validated_data)
        if not datos.get("titulo"):
            raise ValidationError({"titulo": "Escribe un título para la tarjeta."})
        columna = datos.pop("columna", None) or tablero.columnas.activas().first()
        if columna is None:
            raise ValidationError({"columna": "El tablero no tiene columnas."})
        datos.pop("version", None)
        card = servicio.crear_card(tablero=tablero, columna=columna, actor=request.user, **datos)
        return Response(detalle_card(request, card), status=status.HTTP_201_CREATED)


class CardPorNumeroView(APIView):
    """`/tableros/<id>/cards/<numero>/`: la URL que ve el usuario (deep link)."""

    def get(self, request, pk, numero):
        tablero = obtener_tablero(request, pk)
        card = get_object_or_404(Card, tablero=tablero, numero=numero)
        return Response(detalle_card(request, card))


class CardDetalleView(APIView):
    def get(self, request, pk):
        return Response(detalle_card(request, obtener_card(request, pk)))

    def patch(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        datos = CardEscrituraSerializer(
            data=request.data, context={"tablero": card.tablero, "card": card}, partial=True
        )
        datos.is_valid(raise_exception=True)
        datos = dict(datos.validated_data)
        if "version" not in datos:
            raise ValidationError({"version": "Falta la versión de la tarjeta."})
        try:
            card = servicio.editar_card(card, actor=request.user, **datos)
        except ConflictoDeVersion as exc:
            return conflicto(exc, detalle_card(request, exc.actual))
        return Response(detalle_card(request, card))


class CardMoverView(APIView):
    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        destino = get_object_or_404(Columna, pk=request.data.get("columna"))
        try:
            posicion = int(request.data.get("posicion", 0))
        except (TypeError, ValueError):
            raise ValidationError({"posicion": "Posición inválida."})
        servicio.mover_card(card, destino=destino, posicion=posicion, actor=request.user)
        return Response(detalle_card(request, card))


class CardArchivarView(APIView):
    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        servicio.archivar_card(card, archivada=booleano(request, "archivada", True), actor=request.user)
        return Response(detalle_card(request, card))


class CardTrasladarView(APIView):
    """Lleva la tarjeta a un tablero de EQUIPO donde también puedes editar
    (p. ej. de tu tablero personal al de tu equipo)."""

    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        destino = get_object_or_404(Tablero.objects.select_related("equipo"), pk=request.data.get("tablero"))
        if destino.es_personal:
            raise ValidationError({"tablero": "Solo se puede trasladar a un tablero de equipo."})
        if not permisos.puede_editar_tablero(request.user, destino):
            raise PermissionDenied("No puedes crear tarjetas en ese tablero.")
        servicio.trasladar_card(card, destino=destino, actor=request.user)
        return Response(detalle_card(request, card))


class ActividadView(APIView):
    def get(self, request, pk):
        card = obtener_card(request, pk)
        qs = card.actividad.select_related("actor__disciplina")[:100]
        return Response(ActividadSerializer(qs, many=True).data)
