from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from tableros.models import Card

from ..serializers import MisTareaSerializer
from .comunes import contexto


class MisTareasView(APIView):
    """Cards abiertas donde soy responsable, de todos los tableros que puedo ver."""

    def get(self, request):
        usuario = request.user
        qs = (
            Card.objects.abiertas()
            .filter(columna__archivada=False)
            .asignadas_a(usuario)
            .visibles_para(usuario)
            .con_detalle()
            .por_fecha_fin()
        )
        return Response(MisTareaSerializer(qs[:300], many=True, context=contexto(request)).data)
