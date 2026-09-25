"""API del Gantt (`/api/v1/`): dependencias y reprogramación.

Las tarjetas y sus fechas vienen del mismo detalle de tablero que usa el
Kanban: así un cambio en una vista se ve de inmediato en la otra.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.errores import ConflictoDeVersion
from gantt.models import Dependencia
from gantt.services import dependencias as servicio
from gantt.services.programacion import programar
from tableros.api.serializers import CardResumenSerializer
from tableros.api.views.comunes import conflicto, contexto, detalle_card, obtener_card, obtener_tablero
from tableros.models import Card

from .serializers import (
    DependenciaCambioSerializer,
    DependenciaEscrituraSerializer,
    DependenciaSerializer,
    ProgramarSerializer,
)


def _dependencias(tablero):
    return Dependencia.objects.del_tablero(tablero).select_related("predecesora", "sucesora").order_by("id")


class DependenciasView(APIView):
    def get(self, request, pk):
        tablero = obtener_tablero(request, pk)
        return Response(DependenciaSerializer(_dependencias(tablero), many=True).data)

    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, editar=True)
        datos = DependenciaEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        cards = {c.pk: c for c in Card.objects.filter(tablero=tablero, pk__in=[datos["predecesora"], datos["sucesora"]])}
        if datos["predecesora"] not in cards or datos["sucesora"] not in cards:
            raise ValidationError({"sucesora": "Las dos tarjetas deben ser de este tablero."})
        dep = servicio.crear_dependencia(
            predecesora=cards[datos["predecesora"]],
            sucesora=cards[datos["sucesora"]],
            tipo=datos["tipo"],
            desfase_dias=datos["desfase_dias"],
            actor=request.user,
        )
        return Response(DependenciaSerializer(dep).data, status=status.HTTP_201_CREATED)


class DependenciaDetalleView(APIView):
    def _obtener(self, request, pk) -> Dependencia:
        dep = get_object_or_404(Dependencia.objects.select_related("predecesora", "sucesora"), pk=pk)
        obtener_tablero(request, dep.sucesora.tablero_id, editar=True)
        return dep

    def patch(self, request, pk):
        dep = self._obtener(request, pk)
        datos = DependenciaCambioSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        servicio.editar_dependencia(dep, **datos.validated_data)
        return Response(DependenciaSerializer(dep).data)

    def delete(self, request, pk):
        servicio.eliminar_dependencia(self._obtener(request, pk), actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProgramarView(APIView):
    """Nuevas fechas para una tarjeta; con `mover_sucesoras` empuja la cadena."""

    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        datos = ProgramarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        try:
            cambiadas = programar(card, actor=request.user, **datos.validated_data)
        except ConflictoDeVersion as exc:
            return conflicto(exc, detalle_card(request, exc.actual))
        qs = Card.objects.filter(pk__in=[c.pk for c in cambiadas]).con_detalle()
        return Response({"cards": CardResumenSerializer(qs, many=True, context=contexto(request)).data})
