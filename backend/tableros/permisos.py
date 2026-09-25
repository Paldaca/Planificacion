"""
Quién puede qué (docs/plan-modulo-planificacion.md §5).

El acceso al MÓDULO lo decide el Portal (el middleware SSO ya respondió 403 a
quien no lo tiene). Esto decide el acceso DENTRO del módulo:

| Acción                                   | Personal     | De equipo                     |
|------------------------------------------|--------------|-------------------------------|
| Ver                                      | Solo dueño   | Miembros y lectores           |
| Crear / editar / mover cards, comentar   | Solo dueño   | Administradores y miembros    |
| Columnas, renombrar, archivar el tablero | Solo dueño   | Administradores del equipo    |

El administrador del MÓDULO (según el Portal) ve y administra todos los
equipos, para soporte; nunca ve tableros personales ajenos (D-07).
"""

from __future__ import annotations

from equipos.models import MiembroEquipo, RolEquipo


def es_admin_modulo(usuario) -> bool:
    return bool(
        usuario
        and usuario.is_authenticated
        and (usuario.is_superuser or getattr(usuario, "es_administrador", False))
    )


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


def puede_ver_tablero(usuario, tablero) -> bool:
    if tablero.es_personal:
        return tablero.propietario_id == getattr(usuario, "pk", None)
    return puede_ver_equipo(usuario, tablero.equipo)


def puede_editar_tablero(usuario, tablero) -> bool:
    """Cards y comentarios."""
    if tablero.archivado:
        return False
    if tablero.es_personal:
        return tablero.propietario_id == getattr(usuario, "pk", None)
    if tablero.equipo.archivado:
        return False
    m = membresia(usuario, tablero.equipo)
    return (m is not None and m.puede_editar) or es_admin_modulo(usuario)


def puede_gestionar_tablero(usuario, tablero) -> bool:
    """Columnas, nombre, archivar."""
    if tablero.es_personal:
        return tablero.propietario_id == getattr(usuario, "pk", None)
    return puede_administrar_equipo(usuario, tablero.equipo)


def permisos_tablero(usuario, tablero) -> dict:
    return {
        "editar": puede_editar_tablero(usuario, tablero),
        "gestionar": puede_gestionar_tablero(usuario, tablero) and not tablero.archivado,
        "archivar": (not tablero.es_personal) and puede_gestionar_tablero(usuario, tablero),
    }
