"""API del calendario laboral (`/api/v1/calendario/`).

Consultar: cualquier usuario del módulo (lo usan el Gantt y el Calendario).
Editar: solo el administrador del módulo (el calendario es de toda la empresa).
"""

import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from calendario.models import Feriado
from calendario.services.dias_habiles import feriados_entre
from calendario.services.feriados import crear_feriado, eliminar_feriado
from core.roles import es_admin_modulo

from .serializers import FeriadoEscrituraSerializer

MAX_DIAS_CONSULTA = 800


def _fecha(request, campo, defecto):
    valor = request.query_params.get(campo)
    if not valor:
        return defecto
    try:
        return datetime.date.fromisoformat(valor)
    except ValueError:
        raise ValidationError({campo: "Fecha inválida (AAAA-MM-DD)."})


def _salida(item):
    return {**item, "fecha": item["fecha"].isoformat(), "editable": item["id"] is not None}


class FeriadosView(APIView):
    def get(self, request):
        hoy = timezone.localdate()
        desde = _fecha(request, "desde", hoy.replace(month=1, day=1))
        hasta = _fecha(request, "hasta", hoy.replace(month=12, day=31))
        if hasta < desde or (hasta - desde).days > MAX_DIAS_CONSULTA:
            raise ValidationError({"hasta": "Rango inválido (máximo ~2 años)."})
        return Response([_salida(x) for x in feriados_entre(desde, hasta)])

    def post(self, request):
        if not es_admin_modulo(request.user):
            raise PermissionDenied("Solo el administrador del módulo edita el calendario laboral.")
        datos = FeriadoEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        feriado = crear_feriado(creado_por=request.user, **datos.validated_data)
        return Response(
            {"id": feriado.pk, "fecha": feriado.fecha.isoformat(), "nombre": feriado.nombre, "recurrente": feriado.recurrente},
            status=status.HTTP_201_CREATED,
        )


class FeriadoDetalleView(APIView):
    def delete(self, request, pk):
        if not es_admin_modulo(request.user):
            raise PermissionDenied("Solo el administrador del módulo edita el calendario laboral.")
        eliminar_feriado(get_object_or_404(Feriado, pk=pk))
        return Response(status=status.HTTP_204_NO_CONTENT)
