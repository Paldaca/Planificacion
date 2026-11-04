"""Tarjetas recurrentes: armar la serie desde una tarjeta, listarlas, cambiar
su calendario o su modelo, pausarlas y quitarlas. Verlas basta con ver el
tablero; cambiarlas es de quien lo gestiona (crean tarjetas solas)."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from tableros.models import Card, Recurrencia
from tableros.services import recurrencias as servicio

from ..serializers import RecurrenciaEscrituraSerializer, RecurrenciaSerializer
from .comunes import obtener_card, obtener_tablero


class RecurrenciasView(APIView):
    def get(self, request, pk):
        tablero = obtener_tablero(request, pk)
        return Response(RecurrenciaSerializer(tablero.recurrencias.all(), many=True).data)


class CardRecurrenciaView(APIView):
    """POST {frecuencia, intervalo, dia, anticipacion}: la tarjeta empieza a repetirse."""

    def post(self, request, pk):
        card = obtener_card(request, pk)
        obtener_tablero(request, card.tablero_id, gestionar=True)
        datos = RecurrenciaEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        v = datos.validated_data
        faltan = [c for c in ("frecuencia", "dia") if c not in v]
        if faltan:
            raise ValidationError({c: "Este dato es obligatorio." for c in faltan})
        regla = servicio.crear_recurrencia(
            card,
            frecuencia=v["frecuencia"],
            intervalo=v.get("intervalo", 1),
            dia=v["dia"],
            anticipacion=v.get("anticipacion", 5),
            actor=request.user,
        )
        return Response(RecurrenciaSerializer(regla).data, status=status.HTTP_201_CREATED)


class RecurrenciaDetalleView(APIView):
    def _obtener(self, request, pk) -> Recurrencia:
        regla = get_object_or_404(Recurrencia.objects.select_related("tablero"), pk=pk)
        obtener_tablero(request, regla.tablero_id, gestionar=True)
        return regla

    def patch(self, request, pk):
        regla = self._obtener(request, pk)
        datos = RecurrenciaEscrituraSerializer(data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        cambios = dict(datos.validated_data)
        if "modelo_desde" in cambios:
            cambios["modelo_desde"] = get_object_or_404(Card, pk=cambios["modelo_desde"], tablero_id=regla.tablero_id)
        servicio.editar_recurrencia(regla, **cambios)
        return Response(RecurrenciaSerializer(regla).data)

    def delete(self, request, pk):
        servicio.eliminar_recurrencia(self._obtener(request, pk))
        return Response(status=status.HTTP_204_NO_CONTENT)
