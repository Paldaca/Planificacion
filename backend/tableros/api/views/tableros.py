from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import booleano
from equipos.api.acceso import obtener_equipo
from equipos.models import Equipo
from equipos.permisos import puede_administrar_equipo
from tableros.models import Card, Tablero, TipoTablero
from tableros.services import tableros as servicio

from ..serializers import CardDetalleSerializer, TableroEscrituraSerializer, TableroResumenSerializer
from .comunes import contexto, detalle_tablero, obtener_tablero


class TablerosView(APIView):
    def get(self, request):
        servicio.asegurar_tablero_personal(request.user)
        qs = (
            Tablero.objects.visibles_para(request.user)
            .select_related("equipo")
            .order_by("tipo", "equipo__nombre", "nombre")
        )
        return Response(TableroResumenSerializer(qs, many=True, context=contexto(request)).data)

    def post(self, request):
        datos = TableroEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        if not datos.get("nombre"):
            raise ValidationError({"nombre": "Ponle un nombre al tablero."})
        equipo = get_object_or_404(Equipo, pk=datos.get("equipo"), archivado=False)
        if not puede_administrar_equipo(request.user, equipo):
            raise PermissionDenied("Solo los administradores del equipo pueden crear tableros.")
        tablero = servicio.crear_tablero(
            nombre=datos["nombre"],
            descripcion=datos.get("descripcion", ""),
            tipo=TipoTablero.EQUIPO,
            equipo=equipo,
            creado_por=request.user,
        )
        return Response(detalle_tablero(request, tablero), status=status.HTTP_201_CREATED)


class TableroDetalleView(APIView):
    def get(self, request, pk):
        return Response(detalle_tablero(request, obtener_tablero(request, pk)))

    def patch(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        datos = TableroEscrituraSerializer(data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        servicio.editar_tablero(tablero, **datos.validated_data)
        return Response(detalle_tablero(request, tablero))


class TableroArchivarView(APIView):
    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, gestionar=True)
        servicio.archivar_tablero(tablero, archivado=booleano(request, "archivado", True))
        return Response(TableroResumenSerializer(tablero, context=contexto(request)).data)


class TableroCardsArchivadasView(APIView):
    def get(self, request, pk):
        tablero = obtener_tablero(request, pk)
        qs = Card.objects.filter(tablero=tablero, archivada=True).con_detalle().order_by("-archivada_en")
        return Response(CardDetalleSerializer(qs[:100], many=True, context=contexto(request)).data)


class EquipoTablerosView(APIView):
    """Tableros de un equipo (incluye archivados para quien lo administra)."""

    def get(self, request, pk):
        equipo = obtener_equipo(request, pk)
        qs = equipo.tableros.select_related("equipo").order_by("archivado", "nombre")
        if not puede_administrar_equipo(request.user, equipo):
            qs = qs.filter(archivado=False)
        contexto_equipo = {"request": request, "hoy": timezone.localdate()}
        return Response(TableroResumenSerializer(qs, many=True, context=contexto_equipo).data)
