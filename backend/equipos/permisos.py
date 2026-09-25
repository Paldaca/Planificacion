"""
Quién puede qué dentro de un equipo (docs/plan-modulo-planificacion.md §5).

El administrador del MÓDULO (según el Portal) ve y administra todos los
equipos, para soporte.
"""

from __future__ import annotations

from core.roles import es_admin_modulo

from .models import MiembroEquipo, RolEquipo


def membresia(usuario, equipo) -> MiembroEquipo | None:
    # Sin caché a propósito: guardarla en el objeto usuario la dejaba vieja
    # cuando ese objeto sobrevive entre peticiones (force_authenticate en
    # tests) o cuando la misma petición cambia la membresía.
    if not (usuario and usuario.is_authenticated) or equipo is None:
        return None
    return MiembroEquipo.objects.filter(equipo=equipo, usuario=usuario).first()


def puede_ver_equipo(usuario, equipo) -> bool:
    return membresia(usuario, equipo) is not None or es_admin_modulo(usuario)


def puede_administrar_equipo(usuario, equipo) -> bool:
    if equipo.archivado and not es_admin_modulo(usuario):
        return False
    m = membresia(usuario, equipo)
    return (m is not None and m.rol == RolEquipo.ADMINISTRADOR) or es_admin_modulo(usuario)
