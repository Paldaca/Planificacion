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

from core.roles import es_admin_modulo
from equipos.permisos import membresia, puede_administrar_equipo, puede_ver_equipo

__all__ = [
    "es_admin_modulo",
    "membresia",
    "permisos_tablero",
    "puede_administrar_equipo",
    "puede_editar_tablero",
    "puede_gestionar_tablero",
    "puede_ver_equipo",
    "puede_ver_tablero",
]


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
        "archivar": _puede_archivar(usuario, tablero),
    }


def _puede_archivar(usuario, tablero) -> bool:
    """Archivar o restaurar. Un personal activo, solo si a su dueño le queda otro."""
    if not puede_gestionar_tablero(usuario, tablero):
        return False
    if not tablero.es_personal or tablero.archivado:
        return True
    from tableros.services.tableros import puede_archivar_personal

    return puede_archivar_personal(tablero)
