"""
API de equipos, miembros e invitaciones (`/api/v1/`).

Nadie entra a un equipo sin decidirlo: un administrador del equipo INVITA, la
persona recibe un aviso en la campana del Portal y ACEPTA (o rechaza) desde
Planificación. Responder o cancelar la invitación resuelve el aviso.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from integracion_portal import directorio, notificaciones
from integracion_portal.personas import buscar, nombre, persona, usuarios_del_modulo
from paldaca_sso.models import CuentaPortal
from tableros import permisos
from tableros.serializers import TableroResumenSerializer
from tableros.views import _booleano

from .models import EstadoInvitacion, Equipo, InvitacionEquipo, MiembroEquipo, RolEquipo
from .serializers import (
    CambiarRolSerializer,
    EquipoEscrituraSerializer,
    EquipoSerializer,
    InvitacionSerializer,
    InvitarSerializer,
    MiembroSerializer,
)

ETIQUETA_ROL = dict(RolEquipo.choices)


class ServicioNoDisponible(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "No se pudo confirmar a esa persona con el Portal. Intenta de nuevo en un momento."


def _ctx(request):
    return {"request": request}


def obtener_equipo(request, pk, *, administrar=False) -> Equipo:
    equipo = get_object_or_404(Equipo, pk=pk)
    if not permisos.puede_ver_equipo(request.user, equipo):
        raise PermissionDenied("No perteneces a este equipo.")
    if administrar and not permisos.puede_administrar_equipo(request.user, equipo):
        raise PermissionDenied("Solo los administradores del equipo pueden hacer esto.")
    return equipo


def _admins(equipo):
    return equipo.miembros.filter(rol=RolEquipo.ADMINISTRADOR)


# --- Equipos --------------------------------------------------------------------


class EquiposView(APIView):
    def get(self, request):
        usuario = request.user
        qs = Equipo.objects.filter(archivado=False)
        if not permisos.es_admin_modulo(usuario):
            qs = qs.filter(miembros__usuario=usuario)
        qs = qs.distinct().order_by("nombre")
        return Response(EquipoSerializer(qs, many=True, context=_ctx(request)).data)

    def post(self, request):
        datos = EquipoEscrituraSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        if not datos.get("nombre"):
            raise ValidationError({"nombre": "Ponle un nombre al equipo."})
        with transaction.atomic():
            equipo = Equipo.objects.create(
                nombre=datos["nombre"],
                descripcion=datos.get("descripcion", ""),
                color=datos.get("color", "#32407b"),
                creado_por=request.user,
            )
            MiembroEquipo.objects.create(
                equipo=equipo,
                usuario=request.user,
                rol=RolEquipo.ADMINISTRADOR,
                agregado_por=request.user,
            )
        return Response(EquipoSerializer(equipo, context=_ctx(request)).data, status=status.HTTP_201_CREATED)


class EquipoDetalleView(APIView):
    def get(self, request, pk):
        return Response(EquipoSerializer(obtener_equipo(request, pk), context=_ctx(request)).data)

    def patch(self, request, pk):
        equipo = obtener_equipo(request, pk, administrar=True)
        datos = EquipoEscrituraSerializer(data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        for campo, valor in datos.validated_data.items():
            setattr(equipo, campo, valor)
        equipo.save()
        return Response(EquipoSerializer(equipo, context=_ctx(request)).data)


class EquipoArchivarView(APIView):
    def post(self, request, pk):
        equipo = obtener_equipo(request, pk, administrar=True)
        equipo.archivado = _booleano(request, "archivado", True)
        equipo.save(update_fields=["archivado", "actualizado_en"])
        return Response(EquipoSerializer(equipo, context=_ctx(request)).data)


class EquipoTablerosView(APIView):
    """Tableros del equipo (incluye archivados para quien administra)."""

    def get(self, request, pk):
        equipo = obtener_equipo(request, pk)
        qs = equipo.tableros.select_related("equipo").order_by("archivado", "nombre")
        if not permisos.puede_administrar_equipo(request.user, equipo):
            qs = qs.filter(archivado=False)
        contexto = {"request": request, "hoy": timezone.localdate()}
        return Response(TableroResumenSerializer(qs, many=True, context=contexto).data)


# --- Miembros -------------------------------------------------------------------


class MiembrosView(APIView):
    def get(self, request, pk):
        equipo = obtener_equipo(request, pk)
        qs = equipo.miembros.select_related("usuario__disciplina", "agregado_por__disciplina").order_by(
            "usuario__first_name", "usuario__last_name"
        )
        return Response(MiembroSerializer(qs, many=True, context=_ctx(request)).data)


class MiembroDetalleView(APIView):
    def _obtener(self, request, pk, miembro_pk):
        equipo = obtener_equipo(request, pk, administrar=True)
        return equipo, get_object_or_404(MiembroEquipo, pk=miembro_pk, equipo=equipo)

    def patch(self, request, pk, miembro_pk):
        equipo, miembro = self._obtener(request, pk, miembro_pk)
        datos = CambiarRolSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        nuevo = datos.validated_data["rol"]
        if (
            miembro.rol == RolEquipo.ADMINISTRADOR
            and nuevo != RolEquipo.ADMINISTRADOR
            and _admins(equipo).count() <= 1
        ):
            return Response(
                {"detail": "El equipo necesita al menos un administrador."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        miembro.rol = nuevo
        miembro.save(update_fields=["rol"])
        return Response(MiembroSerializer(miembro, context=_ctx(request)).data)

    def delete(self, request, pk, miembro_pk):
        equipo, miembro = self._obtener(request, pk, miembro_pk)
        if miembro.rol == RolEquipo.ADMINISTRADOR and _admins(equipo).count() <= 1:
            return Response(
                {"detail": "No puedes quitar al único administrador del equipo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        miembro.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SalirEquipoView(APIView):
    def post(self, request, pk):
        equipo = obtener_equipo(request, pk)
        miembro = MiembroEquipo.objects.filter(equipo=equipo, usuario=request.user).first()
        if miembro is None:
            return Response({"detail": "No eres miembro de este equipo."}, status=status.HTTP_400_BAD_REQUEST)
        if miembro.rol == RolEquipo.ADMINISTRADOR and _admins(equipo).count() <= 1:
            return Response(
                {"detail": "Nombra a otro administrador antes de salir del equipo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        miembro.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Personas -------------------------------------------------------------------


class PersonasView(APIView):
    """Buscador para invitar (§6.2).

    Fuente principal: el Portal, con TODAS las personas que tienen el módulo
    asignado (`integracion_portal.directorio`). Si el Portal no responde, cae a
    quienes ya entraron alguna vez al módulo y lo indica (`fuente = "local"`).
    Con `?equipo=<id>` excluye a los miembros y a los invitados pendientes."""

    MAX_RESULTADOS = 10

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if len(q) < directorio.MIN_CONSULTA:
            return Response({"resultados": [], "fuente": "portal"})

        excluidos = {request.user.pk}
        equipo_id = request.query_params.get("equipo")
        if equipo_id:
            equipo = obtener_equipo(request, equipo_id)
            excluidos |= set(MiembroEquipo.objects.filter(equipo=equipo).values_list("usuario_id", flat=True))
            excluidos |= set(
                InvitacionEquipo.objects.filter(equipo=equipo, estado=EstadoInvitacion.PENDIENTE).values_list(
                    "invitado_id", flat=True
                )
            )

        try:
            encontrados = directorio.buscar(request, q)
        except directorio.DirectorioNoDisponible:
            locales = buscar(q).exclude(pk__in=excluidos)[: self.MAX_RESULTADOS]
            return Response({"resultados": [persona(u) for u in locales], "fuente": "local"})

        cuentas = {
            c.portal_user_id: c.usuario
            for c in CuentaPortal.objects.select_related("usuario").filter(
                portal_user_id__in=[d["id"] for d in encontrados]
            )
        }
        resultados = []
        for datos in encontrados:
            local = cuentas.get(datos["id"])
            if local is not None and local.pk in excluidos:
                continue
            resultados.append(directorio.persona_desde_portal(datos, local))
        return Response({"resultados": resultados[: self.MAX_RESULTADOS], "fuente": "portal"})


# --- Invitaciones -----------------------------------------------------------------


def _avisar_invitacion(invitacion: InvitacionEquipo, actor) -> None:
    equipo = invitacion.equipo
    rol = ETIQUETA_ROL.get(invitacion.rol, invitacion.rol).lower()
    cuerpo = f"{nombre(actor)} te invitó a unirte al equipo {equipo.nombre} como {rol}."
    if invitacion.mensaje:
        cuerpo += f" «{invitacion.mensaje}»"
    notificaciones.emitir(
        codigo=notificaciones.INVITACION_EQUIPO,
        titulo=f"Invitación al equipo {equipo.nombre}",
        cuerpo=cuerpo,
        destinatarios=[invitacion.invitado],
        actor=actor,
        ruta="/invitaciones",
        clave_agrupacion=invitacion.clave_aviso,
    )


def _resolver_aviso(invitacion: InvitacionEquipo) -> None:
    notificaciones.resolver(
        codigo=notificaciones.INVITACION_EQUIPO, clave_agrupacion=invitacion.clave_aviso
    )


class InvitacionesEquipoView(APIView):
    def get(self, request, pk):
        equipo = obtener_equipo(request, pk, administrar=True)
        qs = equipo.invitaciones.filter(estado=EstadoInvitacion.PENDIENTE).select_related(
            "invitado__disciplina", "invitado_por__disciplina", "equipo"
        )
        return Response(InvitacionSerializer(qs, many=True, context=_ctx(request)).data)

    def post(self, request, pk):
        equipo = obtener_equipo(request, pk, administrar=True)
        datos = InvitarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        datos = datos.validated_data
        invitado = self._invitado(request, datos)
        if invitado is None:
            raise ValidationError({"usuario": "Esa persona no tiene acceso a Planificación."})
        if invitado.pk == request.user.pk:
            raise ValidationError({"usuario": "No puedes invitarte a ti mismo."})
        if MiembroEquipo.objects.filter(equipo=equipo, usuario=invitado).exists():
            raise ValidationError({"usuario": "Esa persona ya es miembro del equipo."})
        try:
            with transaction.atomic():
                invitacion = InvitacionEquipo.objects.create(
                    equipo=equipo,
                    invitado=invitado,
                    invitado_por=request.user,
                    rol=datos["rol"],
                    mensaje=datos.get("mensaje", "").strip(),
                )
                _avisar_invitacion(invitacion, request.user)
        except IntegrityError:
            raise ValidationError({"usuario": "Esa persona ya tiene una invitación pendiente."})
        return Response(
            InvitacionSerializer(invitacion, context=_ctx(request)).data, status=status.HTTP_201_CREATED
        )

    def _invitado(self, request, datos):
        """Usuario local a invitar.

        Por `portal_id` (resultado del buscador del Portal) se confirma SIEMPRE
        contra el Portal antes de crear nada; por `usuario` (id local) basta con
        que la cuenta espejo tenga el módulo."""
        if datos.get("usuario") is not None:
            return usuarios_del_modulo().filter(pk=datos["usuario"]).first()
        portal_id = datos["portal_id"]
        if not directorio.cookie_portal(request):
            return usuarios_del_modulo().filter(cuenta_portal__portal_user_id=portal_id).first()
        try:
            confirmado = directorio.confirmar(request, portal_id)
        except directorio.DirectorioNoDisponible:
            raise ServicioNoDisponible()
        if confirmado is None:
            return None
        return directorio.cuenta_local(confirmado)


class InvitacionCancelarView(APIView):
    def post(self, request, pk):
        invitacion = get_object_or_404(InvitacionEquipo, pk=pk)
        obtener_equipo(request, invitacion.equipo_id, administrar=True)
        if invitacion.estado != EstadoInvitacion.PENDIENTE:
            return Response({"detail": "La invitación ya fue respondida."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            invitacion.estado = EstadoInvitacion.CANCELADA
            invitacion.respondida_en = timezone.now()
            invitacion.save(update_fields=["estado", "respondida_en"])
            _resolver_aviso(invitacion)
        return Response(InvitacionSerializer(invitacion, context=_ctx(request)).data)


class MisInvitacionesView(APIView):
    def get(self, request):
        qs = (
            InvitacionEquipo.objects.filter(
                invitado=request.user, estado=EstadoInvitacion.PENDIENTE, equipo__archivado=False
            )
            .select_related("equipo", "invitado__disciplina", "invitado_por__disciplina")
            .order_by("-creada_en")
        )
        return Response(InvitacionSerializer(qs, many=True, context=_ctx(request)).data)


class ResponderInvitacionView(APIView):
    aceptar = True

    def post(self, request, pk):
        invitacion = get_object_or_404(
            InvitacionEquipo.objects.select_related("equipo"),
            Q(pk=pk) & Q(invitado=request.user),
        )
        if invitacion.estado != EstadoInvitacion.PENDIENTE:
            return Response({"detail": "Esta invitación ya no está pendiente."}, status=status.HTTP_400_BAD_REQUEST)
        if invitacion.equipo.archivado:
            return Response({"detail": "El equipo fue archivado."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            invitacion.estado = EstadoInvitacion.ACEPTADA if self.aceptar else EstadoInvitacion.RECHAZADA
            invitacion.respondida_en = timezone.now()
            invitacion.save(update_fields=["estado", "respondida_en"])
            if self.aceptar:
                MiembroEquipo.objects.get_or_create(
                    equipo=invitacion.equipo,
                    usuario=request.user,
                    defaults={"rol": invitacion.rol, "agregado_por": invitacion.invitado_por},
                )
            _resolver_aviso(invitacion)
        cuerpo = InvitacionSerializer(invitacion, context=_ctx(request)).data
        if self.aceptar:
            cuerpo["equipo_detalle"] = EquipoSerializer(invitacion.equipo, context=_ctx(request)).data
        return Response(cuerpo)
