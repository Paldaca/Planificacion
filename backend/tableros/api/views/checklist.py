from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import booleano
from tableros.models import ItemChecklist
from tableros.services import checklist as servicio

from ..serializers import ItemChecklistSerializer
from .comunes import obtener_card


def _texto(request, *, vacio: str) -> str:
    texto = (request.data.get("texto") or "").strip()
    if not texto:
        raise ValidationError({"texto": vacio})
    return texto


class ChecklistView(APIView):
    def post(self, request, pk):
        card = obtener_card(request, pk, editar=True)
        item = servicio.agregar_item(card, texto=_texto(request, vacio="Escribe el elemento."), actor=request.user)
        return Response(ItemChecklistSerializer(item).data, status=status.HTTP_201_CREATED)


class ItemChecklistView(APIView):
    def _obtener(self, request, pk) -> ItemChecklist:
        item = get_object_or_404(ItemChecklist.objects.select_related("card"), pk=pk)
        obtener_card(request, item.card_id, editar=True)
        return item

    def patch(self, request, pk):
        item = self._obtener(request, pk)
        texto = _texto(request, vacio="El elemento no puede quedar vacío.") if "texto" in request.data else None
        hecho = booleano(request, "hecho", item.hecho) if "hecho" in request.data else None
        item = servicio.editar_item(item, actor=request.user, texto=texto, hecho=hecho)
        return Response(ItemChecklistSerializer(item).data)

    def delete(self, request, pk):
        servicio.eliminar_item(self._obtener(request, pk), actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
