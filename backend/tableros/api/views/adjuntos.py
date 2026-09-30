"""Adjuntos de una tarjeta: listar y descargar (quien ve el tablero); subir y
quitar (quien lo edita)."""

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
    def get(self, request, pk):
        adjunto = get_object_or_404(Adjunto, pk=pk)
        obtener_card(request, adjunto.card_id)
        respuesta = HttpResponse(bytes(adjunto.contenido), content_type=adjunto.tipo or "application/octet-stream")
        # Siempre como descarga y sin que el navegador adivine el tipo: un HTML
        # o un SVG subido no debe ejecutarse en el origen de la aplicación.
        respuesta["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(adjunto.nombre)}"
        respuesta["X-Content-Type-Options"] = "nosniff"
        respuesta["Cache-Control"] = "private, no-store"
        return respuesta

    def delete(self, request, pk):
        adjunto = get_object_or_404(Adjunto.objects.sin_contenido().select_related("card"), pk=pk)
        obtener_card(request, adjunto.card_id, editar=True)
        servicio.quitar(adjunto, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
