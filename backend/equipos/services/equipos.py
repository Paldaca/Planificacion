"""Equipos y sus miembros. Regla central: nunca queda un equipo sin administrador."""

from __future__ import annotations

from django.db import transaction

from core.errores import ReglaDeNegocio
from equipos.models import Equipo, MiembroEquipo, RolEquipo

COLOR_PREDETERMINADO = "#32407b"


def _es_ultimo_admin(miembro: MiembroEquipo) -> bool:
    return (
        miembro.rol == RolEquipo.ADMINISTRADOR
        and miembro.equipo.miembros.filter(rol=RolEquipo.ADMINISTRADOR).count() <= 1
    )


@transaction.atomic
def crear_equipo(*, nombre: str, creado_por, descripcion: str = "", color: str = COLOR_PREDETERMINADO) -> Equipo:
    """Quien lo crea queda como administrador."""
    equipo = Equipo.objects.create(nombre=nombre, descripcion=descripcion, color=color, creado_por=creado_por)
    MiembroEquipo.objects.create(
        equipo=equipo, usuario=creado_por, rol=RolEquipo.ADMINISTRADOR, agregado_por=creado_por
    )
    return equipo


def editar_equipo(equipo: Equipo, **cambios) -> Equipo:
    """`cambios`: nombre, descripcion, color."""
    for campo in ("nombre", "descripcion", "color"):
        if campo in cambios:
            setattr(equipo, campo, cambios[campo])
    equipo.save()
    return equipo


def archivar_equipo(equipo: Equipo, *, archivado: bool) -> Equipo:
    equipo.archivado = archivado
    equipo.save(update_fields=["archivado", "actualizado_en"])
    return equipo


@transaction.atomic
def cambiar_rol(miembro: MiembroEquipo, *, rol: str) -> MiembroEquipo:
    if rol != RolEquipo.ADMINISTRADOR and _es_ultimo_admin(miembro):
        raise ReglaDeNegocio("El equipo necesita al menos un administrador.")
    miembro.rol = rol
    miembro.save(update_fields=["rol"])
    return miembro


@transaction.atomic
def quitar_miembro(miembro: MiembroEquipo) -> None:
    if _es_ultimo_admin(miembro):
        raise ReglaDeNegocio("No puedes quitar al único administrador del equipo.")
    miembro.delete()


@transaction.atomic
def salir_del_equipo(equipo: Equipo, *, usuario) -> None:
    miembro = MiembroEquipo.objects.filter(equipo=equipo, usuario=usuario).select_related("equipo").first()
    if miembro is None:
        raise ReglaDeNegocio("No eres miembro de este equipo.")
    if _es_ultimo_admin(miembro):
        raise ReglaDeNegocio("Nombra a otro administrador antes de salir del equipo.")
    miembro.delete()
