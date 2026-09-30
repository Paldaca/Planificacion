"""Adjuntos de una tarjeta: listar, descargar y ver las imágenes (quien ve el
tablero); subir y quitar (quien lo edita)."""

from __future__ import annotations

from urllib.parse import quote

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from tableros.models import Adjunto
from tableros.services import adjuntos as servicio

from ..serializers import AdjuntoSerializer
from .comunes import obtener_card


class AdjuntosView(APIView):
    """GET: los adjuntos de la tarjeta. POST (multipart `archivo`): sube uno."""

    parser_classes = [MultiPartParser]

    def get(self, request, pk):
        card = obtener_card(request, pk)
        adjuntos = card.adjuntos.sin_contenido().select_related("subido_por")
        return Response(AdjuntoSerializer(adjuntos, many=True).data)

    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        try:
            anunciado = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            anunciado = 0
        servicio.comprobar_peticion(anunciado)
        archivo = request.FILES.get("archivo")
        if archivo is None:
            raise ValidationError({"archivo": "Elige un archivo para adjuntar."})
        adjunto = servicio.adjuntar(card, archivo=archivo, actor=request.user)
        return Response(AdjuntoSerializer(adjunto).data, status=status.HTTP_201_CREATED)


class AdjuntoDetalleView(APIView):
    """GET: el archivo, como descarga. Con `?ver=1`, una imagen de las
    permitidas se sirve en línea (para mostrarla en la tarjeta)."""

    def get(self, request, pk):
        adjunto = get_object_or_404(Adjunto, pk=pk)
        obtener_card(request, adjunto.card_id)
        contenido = bytes(adjunto.contenido)
        en_linea = request.query_params.get("ver") == "1" and servicio.se_puede_mostrar(adjunto.tipo, contenido)
        respuesta = HttpResponse(contenido, content_type=adjunto.tipo or servicio.TIPO_GENERICO)
        # Como descarga y sin que el navegador adivine el tipo: un HTML o un
        # SVG subido no debe ejecutarse en el origen de la aplicación. Solo una
        # imagen comprobada va en línea, y aun así sin permiso para ejecutar nada.
        disposicion = "inline" if en_linea else "attachment"
        respuesta["Content-Disposition"] = f"{disposicion}; filename*=UTF-8''{quote(adjunto.nombre)}"
        respuesta["X-Content-Type-Options"] = "nosniff"
        if en_linea:
            respuesta["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
            # Un adjunto no cambia: el navegador puede guardar la imagen un rato.
            respuesta["Cache-Control"] = "private, max-age=3600"
        else:
            respuesta["Cache-Control"] = "private, no-store"
        return respuesta

    def delete(self, request, pk):
        adjunto = get_object_or_404(Adjunto.objects.sin_contenido().select_related("card"), pk=pk)
        obtener_card(request, adjunto.card_id, editar=True)
        servicio.quitar(adjunto, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
