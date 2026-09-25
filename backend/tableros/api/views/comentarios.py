from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from tableros.models import Comentario
from tableros.services import comentarios as servicio

from ..serializers import ComentarioEscrituraSerializer, ComentarioSerializer
from .comunes import contexto, obtener_card


class ComentariosView(APIView):
    def get(self, request, pk):
        card = obtener_card(request, pk)
        qs = card.comentarios.select_related("autor__disciplina").prefetch_related("menciones__disciplina")
        return Response(ComentarioSerializer(qs, many=True, context=contexto(request)).data)

    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        datos = ComentarioEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        comentario = servicio.comentar(card, autor=request.user, texto=datos.validated_data["texto"])
        return Response(
            ComentarioSerializer(comentario, context=contexto(request)).data, status=status.HTTP_201_CREATED
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
        comentario = servicio.editar_comentario(comentario, texto=datos.validated_data["texto"], actor=request.user)
        return Response(ComentarioSerializer(comentario, context=contexto(request)).data)

    def delete(self, request, pk):
        servicio.eliminar_comentario(self._propio(request, pk))
        return Response(status=status.HTTP_204_NO_CONTENT)
