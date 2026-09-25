"""
API de equipos, miembros e invitaciones (`/api/v1/`).

Las reglas viven en `equipos/services/`; aquí solo formato y permisos.
"""

from __future__ import annotations

import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import booleano
from equipos.models import Equipo, InvitacionEquipo, MiembroEquipo
from equipos.services import candidatos, invitaciones
from equipos.services import equipos as servicio

from .acceso import obtener_equipo
from .serializers import (
    CambiarRolSerializer,
    EquipoEscrituraSerializer,
    EquipoSerializer,
    InvitacionSerializer,
    InvitarSerializer,
    MiembroSerializer,
)


def _ctx(request):
    return {"request": request}


# --- Equipos --------------------------------------------------------------------


class EquiposView(APIView):
    def get(self, request):
        qs = Equipo.objects.visibles_para(request.user).order_by("nombre")
        return Response(EquipoSerializer(qs, many=True, context=_ctx(request)).data)

    def post(self, request):
        datos = EquipoEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        if not datos.get("nombre"):
            raise ValidationError({"nombre": "Ponle un nombre al equipo."})
        equipo = servicio.crear_equipo(creado_por=request.user, **datos)
        return Response(EquipoSerializer(equipo, context=_ctx(request)).data, status=status.HTTP_201_CREATED)


class EquipoDetalleView(APIView):
    def get(self, request, pk):
        return Response(EquipoSerializer(obtener_equipo(request, pk), context=_ctx(request)).data)

    def patch(self, request, pk):
        equipo = obtener_equipo(request, pk, administrar=True)
        datos = EquipoEscrituraSerializer(data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        servicio.editar_equipo(equipo, **datos.validated_data)
        return Response(EquipoSerializer(equipo, context=_ctx(request)).data)


class EquipoArchivarView(APIView):
    def post(self, request, pk):
        equipo = obtener_equipo(request, pk, administrar=True)
        servicio.archivar_equipo(equipo, archivado=booleano(request, "archivado", True))
        return Response(EquipoSerializer(equipo, context=_ctx(request)).data)


# --- Miembros -------------------------------------------------------------------


class MiembrosView(APIView):
    def get(self, request, pk):
        equipo = obtener_equipo(request, pk)
        qs = equipo.miembros.select_related("usuario__disciplina", "agregado_por__disciplina").order_by(
            "usuario__first_name", "usuario__last_name"
        )
        return Response(MiembroSerializer(qs, many=True, context=_ctx(request)).data)


class MiembroDetalleView(APIView):
    def _obtener(self, request, pk, miembro_pk) -> MiembroEquipo:
        equipo = obtener_equipo(request, pk, administrar=True)
        return get_object_or_404(MiembroEquipo.objects.select_related("equipo"), pk=miembro_pk, equipo=equipo)

    def patch(self, request, pk, miembro_pk):
        miembro = self._obtener(request, pk, miembro_pk)
        datos = CambiarRolSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        servicio.cambiar_rol(miembro, rol=datos.validated_data["rol"])
        return Response(MiembroSerializer(miembro, context=_ctx(request)).data)

    def delete(self, request, pk, miembro_pk):
        servicio.quitar_miembro(self._obtener(request, pk, miembro_pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


class SalirEquipoView(APIView):
    def post(self, request, pk):
        servicio.salir_del_equipo(obtener_equipo(request, pk), usuario=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Personas -------------------------------------------------------------------


class PersonasView(APIView):
    """Buscador para invitar. Con `?equipo=<id>` excluye a los miembros y a los
    invitados pendientes."""

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        excluidos = {request.user.pk}
        equipo_id = request.query_params.get("equipo")
        if equipo_id and len(q) >= candidatos.MIN_CONSULTA:
            excluidos |= candidatos.ocupados_en(obtener_equipo(request, equipo_id))
        return Response(candidatos.buscar_candidatos(request, q, excluidos=excluidos))


# --- Invitaciones -----------------------------------------------------------------


class InvitacionesEquipoView(APIView):
    def get(self, request, pk):
        """Pendientes y, como historial, las respondidas en los últimos días."""
        equipo = obtener_equipo(request, pk, administrar=True)
        desde = timezone.now() - datetime.timedelta(days=invitaciones.DIAS_HISTORIAL)
        qs = (
            equipo.invitaciones.pendientes_o_respondidas_desde(desde)
            .select_related("invitado__disciplina", "invitado_por__disciplina", "equipo")
            .order_by("-creada_en")[:60]
        )
        return Response(InvitacionSerializer(qs, many=True, context=_ctx(request)).data)

    def post(self, request, pk):
        equipo = obtener_equipo(request, pk, administrar=True)
        datos = InvitarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        invitado = candidatos.resolver_invitado(
            request, usuario_id=datos.get("usuario"), portal_id=datos.get("portal_id")
        )
        if invitado is None:
            raise ValidationError({"usuario": "Esa persona no tiene acceso a Planificación."})
        invitacion = invitaciones.invitar(
            equipo, invitado=invitado, rol=datos["rol"], mensaje=datos.get("mensaje", ""), actor=request.user
        )
        return Response(
            InvitacionSerializer(invitacion, context=_ctx(request)).data, status=status.HTTP_201_CREATED
        )


class InvitacionCancelarView(APIView):
    def post(self, request, pk):
        invitacion = get_object_or_404(InvitacionEquipo, pk=pk)
        obtener_equipo(request, invitacion.equipo_id, administrar=True)
        invitaciones.cancelar(invitacion)
        return Response(InvitacionSerializer(invitacion, context=_ctx(request)).data)


class MisInvitacionesView(APIView):
    def get(self, request):
        qs = (
            InvitacionEquipo.objects.pendientes()
            .filter(invitado=request.user, equipo__archivado=False)
            .select_related("equipo", "invitado__disciplina", "invitado_por__disciplina")
            .order_by("-creada_en")
        )
        return Response(InvitacionSerializer(qs, many=True, context=_ctx(request)).data)


class ResponderInvitacionView(APIView):
    aceptar = True

    def post(self, request, pk):
        invitacion = get_object_or_404(
            InvitacionEquipo.objects.select_related("equipo"), pk=pk, invitado=request.user
        )
        invitaciones.responder(invitacion, aceptar=self.aceptar, usuario=request.user)
        cuerpo = InvitacionSerializer(invitacion, context=_ctx(request)).data
        if self.aceptar:
            cuerpo["equipo_detalle"] = EquipoSerializer(invitacion.equipo, context=_ctx(request)).data
        return Response(cuerpo)
