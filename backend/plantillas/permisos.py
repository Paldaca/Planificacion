"""Quién puede qué con las plantillas (funciones puras, sin HTTP).

| Acción | Personal | De equipo | Global |
|---|---|---|---|
| Verla y usarla | quien la creó | miembros del equipo | todos |
| Crearla, renombrarla, borrarla | quien la crea | administradores del equipo | administrador del módulo |
"""

from __future__ import annotations

from core.roles import es_admin_modulo
from equipos.permisos import membresia, puede_administrar_equipo
from plantillas.models import AlcancePlantilla, Plantilla


def puede_ver_plantilla(usuario, plantilla: Plantilla) -> bool:
    if plantilla.alcance == AlcancePlantilla.GLOBAL:
        return True
    if plantilla.alcance == AlcancePlantilla.PERSONAL:
        return plantilla.propietario_id == getattr(usuario, "pk", None)
    return membresia(usuario, plantilla.equipo) is not None or es_admin_modulo(usuario)


def puede_crear_plantilla(usuario, alcance: str, equipo=None) -> bool:
    if alcance == AlcancePlantilla.PERSONAL:
        return bool(usuario and usuario.is_authenticated)
    if alcance == AlcancePlantilla.EQUIPO:
        return equipo is not None and not equipo.archivado and puede_administrar_equipo(usuario, equipo)
    return es_admin_modulo(usuario)


def puede_gestionar_plantilla(usuario, plantilla: Plantilla) -> bool:
    return puede_crear_plantilla(usuario, plantilla.alcance, plantilla.equipo) and (
        plantilla.alcance != AlcancePlantilla.PERSONAL or plantilla.propietario_id == getattr(usuario, "pk", None)
    )
