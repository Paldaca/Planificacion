"""Tableros: alta con columnas predeterminadas, tablero personal, edición y archivo."""

from __future__ import annotations

from django.db import IntegrityError, transaction

from core.errores import ReglaDeNegocio
from tableros.models import COLUMNAS_PREDETERMINADAS, Columna, Tablero, TipoTablero

NOMBRE_TABLERO_PERSONAL = "Mi tablero"


@transaction.atomic
def crear_tablero(*, nombre: str, creado_por, tipo: str, propietario=None, equipo=None, descripcion: str = "") -> Tablero:
    tablero = Tablero.objects.create(
        nombre=nombre,
        descripcion=descripcion,
        tipo=tipo,
        propietario=propietario,
        equipo=equipo,
        creado_por=creado_por,
    )
    Columna.objects.bulk_create(
        [
            Columna(tablero=tablero, nombre=nombre_col, orden=i, es_final=es_final)
            for i, (nombre_col, es_final) in enumerate(COLUMNAS_PREDETERMINADAS)
        ]
    )
    return tablero


def asegurar_tablero_personal(usuario) -> Tablero:
    existente = Tablero.objects.filter(tipo=TipoTablero.PERSONAL, propietario=usuario).first()
    if existente:
        return existente
    try:
        return crear_tablero(
            nombre=NOMBRE_TABLERO_PERSONAL,
            creado_por=usuario,
            tipo=TipoTablero.PERSONAL,
            propietario=usuario,
        )
    except IntegrityError:
        # Dos pestañas a la vez: la otra ganó la restricción única.
        return Tablero.objects.get(tipo=TipoTablero.PERSONAL, propietario=usuario)


def editar_tablero(tablero: Tablero, **cambios) -> Tablero:
    """`cambios`: nombre, descripcion."""
    for campo in ("nombre", "descripcion"):
        if campo in cambios:
            setattr(tablero, campo, cambios[campo])
    tablero.save()
    return tablero


def archivar_tablero(tablero: Tablero, *, archivado: bool) -> Tablero:
    if tablero.es_personal:
        raise ReglaDeNegocio("El tablero personal no se puede archivar.")
    tablero.archivado = archivado
    tablero.save(update_fields=["archivado", "actualizado_en"])
    return tablero
