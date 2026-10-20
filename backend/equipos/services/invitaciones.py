"""
Invitaciones a un equipo.

Nadie entra a un equipo sin decidirlo: un administrador INVITA, la persona
recibe un aviso en la campana del Portal y un correo, y ACEPTA (o rechaza)
desde Planificación. Responder o cancelar la invitación resuelve el aviso;
quien invitó se entera de la respuesta (solo en la campana).
"""

from __future__ import annotations

import logging
import threading

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from core.errores import ReglaDeNegocio
from equipos import permisos
from equipos.models import Equipo, EstadoInvitacion, InvitacionEquipo, MiembroEquipo, RolEquipo
from integracion_portal.services import notificaciones as n
from integracion_portal.services.personas import nombre

logger = logging.getLogger("planificacion.equipos")

ETIQUETA_ROL = dict(RolEquipo.choices)

#: Cuántos días de invitaciones ya respondidas ve el administrador del equipo.
DIAS_HISTORIAL = 30


# --- Avisos ---------------------------------------------------------------------


def _rol(invitacion: InvitacionEquipo) -> str:
    return ETIQUETA_ROL.get(invitacion.rol, invitacion.rol).lower()


def _avisar_invitacion(invitacion: InvitacionEquipo, actor) -> None:
    equipo = invitacion.equipo
    cuerpo = f"{nombre(actor)} te invitó a unirte al equipo {equipo.nombre} como {_rol(invitacion)}."
    if invitacion.mensaje:
        cuerpo += f" «{invitacion.mensaje}»"
    n.emitir(
        codigo=n.INVITACION_EQUIPO,
        titulo=f"Invitación al equipo {equipo.nombre}",
        cuerpo=cuerpo,
        destinatarios=[invitacion.invitado],
        actor=actor,
        ruta=f"/invitaciones?invitacion={invitacion.pk}",
        clave_agrupacion=invitacion.clave_aviso,
    )
    _programar_correo_invitacion(invitacion, cuerpo)


def _programar_correo_invitacion(invitacion: InvitacionEquipo, cuerpo: str) -> None:
    """El correo sale tras el commit. Si el SMTP falla, la invitación queda."""
    destino = (invitacion.invitado.email or "").strip()
    if not destino:
        logger.info("INVITACION_SIN_CORREO | invitacion=%s", invitacion.pk)
        return
    enlace = n.url_en_portal(f"/invitaciones?invitacion={invitacion.pk}")
    asunto = f"Invitación al equipo {invitacion.equipo.nombre}"
    texto = f"{cuerpo}\n\nAcepta o rechaza la invitación:\n{enlace}\n"
    invitacion_id = invitacion.pk
    transaction.on_commit(lambda: _despachar_correo(destino, asunto, texto, invitacion_id))


def _despachar_correo(destino: str, asunto: str, texto: str, invitacion_id: int) -> None:
    if getattr(settings, "PALDACA_NOTIF_ASINCRONO", True):
        threading.Thread(
            target=_enviar_correo_invitacion,
            args=(destino, asunto, texto, invitacion_id),
            daemon=True,
        ).start()
        return
    _enviar_correo_invitacion(destino, asunto, texto, invitacion_id)


def _enviar_correo_invitacion(destino: str, asunto: str, texto: str, invitacion_id: int) -> None:
    try:
        send_mail(asunto, texto, settings.DEFAULT_FROM_EMAIL, [destino], fail_silently=False)
    except Exception:
        logger.exception("INVITACION_CORREO_FALLO | invitacion=%s", invitacion_id)
    else:
        logger.info("INVITACION_CORREO_ENVIADO | invitacion=%s", invitacion_id)


def _resolver_aviso(invitacion: InvitacionEquipo) -> None:
    n.resolver(codigo=n.INVITACION_EQUIPO, clave_agrupacion=invitacion.clave_aviso)


def _avisar_respuesta(invitacion: InvitacionEquipo, actor) -> None:
    """Quien invitó se entera de la respuesta (si sigue en el equipo)."""
    anfitrion = invitacion.invitado_por
    if anfitrion is None or not permisos.puede_ver_equipo(anfitrion, invitacion.equipo):
        return
    equipo = invitacion.equipo
    aceptada = invitacion.estado == EstadoInvitacion.ACEPTADA
    cuerpo = (
        f"Ya es {_rol(invitacion)} de {equipo.nombre}."
        if aceptada
        else f"No se unirá a {equipo.nombre}. Puedes volver a invitarle más adelante."
    )
    n.emitir(
        codigo=n.INVITACION_RESPONDIDA,
        titulo=f"{nombre(actor)} {'aceptó' if aceptada else 'rechazó'} tu invitación",
        cuerpo=cuerpo,
        destinatarios=[anfitrion],
        actor=actor,
        ruta=f"/equipos/{equipo.pk}",
    )


# --- Operaciones ----------------------------------------------------------------


def invitar(equipo: Equipo, *, invitado, rol: str, actor, mensaje: str = "") -> InvitacionEquipo:
    if invitado.pk == actor.pk:
        raise ReglaDeNegocio("No puedes invitarte a ti mismo.")
    if MiembroEquipo.objects.filter(equipo=equipo, usuario=invitado).exists():
        raise ReglaDeNegocio("Esa persona ya es miembro del equipo.")
    try:
        with transaction.atomic():
            # «Una sola pendiente» también se comprueba aquí: MySQL no admite la
            # restricción única con condición (`invitacion_pendiente_unica`) y
            # la ignora. Con el equipo bloqueado, dos invitaciones simultáneas
            # a la misma persona no pasan ambas.
            Equipo.objects.select_for_update().filter(pk=equipo.pk).first()
            if InvitacionEquipo.objects.filter(
                equipo=equipo, invitado=invitado, estado=EstadoInvitacion.PENDIENTE
            ).exists():
                raise IntegrityError
            invitacion = InvitacionEquipo.objects.create(
                equipo=equipo, invitado=invitado, invitado_por=actor, rol=rol, mensaje=mensaje.strip()
            )
            _avisar_invitacion(invitacion, actor)
    except IntegrityError:
        raise ReglaDeNegocio("Esa persona ya tiene una invitación pendiente.")
    return invitacion


@transaction.atomic
def cancelar(invitacion: InvitacionEquipo) -> InvitacionEquipo:
    if invitacion.estado != EstadoInvitacion.PENDIENTE:
        raise ReglaDeNegocio("La invitación ya fue respondida.")
    invitacion.estado = EstadoInvitacion.CANCELADA
    invitacion.respondida_en = timezone.now()
    invitacion.save(update_fields=["estado", "respondida_en"])
    _resolver_aviso(invitacion)
    return invitacion


@transaction.atomic
def responder(invitacion: InvitacionEquipo, *, aceptar: bool, usuario) -> InvitacionEquipo:
    if invitacion.estado != EstadoInvitacion.PENDIENTE:
        raise ReglaDeNegocio("Esta invitación ya no está pendiente.")
    if invitacion.equipo.archivado:
        raise ReglaDeNegocio("El equipo fue archivado.")
    invitacion.estado = EstadoInvitacion.ACEPTADA if aceptar else EstadoInvitacion.RECHAZADA
    invitacion.respondida_en = timezone.now()
    invitacion.save(update_fields=["estado", "respondida_en"])
    if aceptar:
        MiembroEquipo.objects.get_or_create(
            equipo=invitacion.equipo,
            usuario=usuario,
            defaults={"rol": invitacion.rol, "agregado_por": invitacion.invitado_por},
        )
    _resolver_aviso(invitacion)
    _avisar_respuesta(invitacion, usuario)
    return invitacion
