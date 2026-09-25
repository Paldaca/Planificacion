from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.errores import ConflictoDeVersion
from tableros.models import Columna
from tableros.services import columnas as servicio

from ..serializers import ColumnaEscrituraSerializer, ColumnaSerializer
from .comunes import conflicto, obtener_tablero


def _obtener_columna(request, pk) -> Columna:
    columna = get_object_or_404(Columna, pk=pk, archivada=False)
    obtener_tablero(request, columna.tablero_id, gestionar=True)
    return columna


class ColumnasView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        nombre = (request.data.get("nombre") or "").strip()
        if not nombre:
            raise ValidationError({"nombre": "Ponle un nombre a la columna."})
        columna = servicio.crear_columna(tablero, nombre=nombre)
        return Response(ColumnaSerializer(columna).data, status=status.HTTP_201_CREATED)


class ColumnasReordenarView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        ids = request.data.get("orden")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            raise ValidationError({"orden": "Envía la lista de ids de columnas."})
        columnas = servicio.reordenar_columnas(tablero, ids=ids)
        return Response(ColumnaSerializer(columnas, many=True).data)


class ColumnaDetalleView(APIView):
    def patch(self, request, pk):
        columna = _obtener_columna(request, pk)
        datos = ColumnaEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        try:
            columna = servicio.editar_columna(columna, **datos.validated_data)
        except ConflictoDeVersion as exc:
            return conflicto(exc, ColumnaSerializer(exc.actual).data)
        return Response(ColumnaSerializer(columna).data)


class ColumnaArchivarView(APIView):
    def post(self, request, pk):
        columna = _obtener_columna(request, pk)
        destino = None
        if request.data.get("mover_a") is not None:
            destino = get_object_or_404(Columna, pk=request.data["mover_a"])
        servicio.archivar_columna(columna, destino=destino)
        return Response(status=status.HTTP_204_NO_CONTENT)
