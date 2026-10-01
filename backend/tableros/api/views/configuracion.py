"""Configuración de un tablero (fase 5): etiquetas y campos personalizados.
Solo quien gestiona el tablero (como las columnas)."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from tableros.models import CampoPersonalizado, Etiqueta
from tableros.services import campos as servicio_campos
from tableros.services import etiquetas as servicio_etiquetas

from ..serializers import CampoEscrituraSerializer, CampoSerializer, EtiquetaEscrituraSerializer, EtiquetaSerializer
from .comunes import obtener_tablero


class EtiquetasView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        datos = EtiquetaEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        if not datos.validated_data.get("nombre"):
            raise ValidationError({"nombre": "Ponle un nombre a la etiqueta."})
        etiqueta = servicio_etiquetas.crear_etiqueta(
            tablero,
            nombre=datos.validated_data["nombre"],
            color=datos.validated_data.get("color", "#2563eb"),
            es_hito=datos.validated_data.get("es_hito", False),
        )
        return Response(EtiquetaSerializer(etiqueta).data, status=status.HTTP_201_CREATED)


class EtiquetaDetalleView(APIView):
    def _obtener(self, request, pk) -> Etiqueta:
        etiqueta = get_object_or_404(Etiqueta, pk=pk)
        obtener_tablero(request, etiqueta.tablero_id, gestionar=True)
        return etiqueta

    def patch(self, request, pk):
        etiqueta = self._obtener(request, pk)
        datos = EtiquetaEscrituraSerializer(data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        servicio_etiquetas.editar_etiqueta(etiqueta, **datos.validated_data)
        return Response(EtiquetaSerializer(etiqueta).data)

    def delete(self, request, pk):
        servicio_etiquetas.eliminar_etiqueta(self._obtener(request, pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


class CamposView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        datos = CampoEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        v = datos.validated_data
        if not v.get("nombre") or not v.get("tipo"):
            raise ValidationError({"nombre": "Indica el nombre y el tipo del campo."})
        campo = servicio_campos.crear_campo(
            tablero,
            nombre=v["nombre"],
            tipo=v["tipo"],
            opciones=v.get("opciones"),
            visible_en_tarjeta=v.get("visible_en_tarjeta", False),
            atajo_al_crear=v.get("atajo_al_crear", False),
        )
        return Response(CampoSerializer(campo).data, status=status.HTTP_201_CREATED)


class CampoDetalleView(APIView):
    def patch(self, request, pk):
        campo = get_object_or_404(CampoPersonalizado.objects.select_related("tablero"), pk=pk)
        obtener_tablero(request, campo.tablero_id, gestionar=True)
        datos = CampoEscrituraSerializer(data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        cambios = dict(datos.validated_data)
        if cambios.pop("tipo", campo.tipo) != campo.tipo:
            raise ValidationError({"tipo": "El tipo de un campo no cambia después de creado."})
        servicio_campos.editar_campo(campo, **cambios)
        return Response(CampoSerializer(campo).data)
