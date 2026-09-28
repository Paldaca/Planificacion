"""Etiquetas de un tablero (fase 5). Las define quien gestiona el tablero; las
asigna a las tarjetas quien las edita (`tarjetas.editar_card`)."""

from __future__ import annotations

import re

from django.db import IntegrityError, transaction
from django.db.models import Max

from core.errores import ReglaDeNegocio
from core.texto import clave_nombre
from tableros.models import Etiqueta, Tablero

MAX_ETIQUETAS = 30
_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _repetida(tablero_id: int, nombre: str, excepto: int | None = None) -> bool:
    """Sin mayúsculas ni acentos, como compara MySQL (la restricción única en
    SQLite sí los distingue): así el resultado no depende de la base."""
    clave = clave_nombre(nombre)
    otras = Etiqueta.objects.filter(tablero_id=tablero_id).exclude(pk=excepto).values_list("nombre", flat=True)
    return any(clave_nombre(n) == clave for n in otras)


def _validar(nombre: str | None, color: str | None) -> None:
    if nombre is not None and not nombre.strip():
        raise ReglaDeNegocio("Ponle un nombre a la etiqueta.")
    if color is not None and not _COLOR.match(color):
        raise ReglaDeNegocio("Color inválido (usa #RRGGBB).")


@transaction.atomic
def crear_etiqueta(tablero: Tablero, *, nombre: str, color: str) -> Etiqueta:
    _validar(nombre, color)
    if tablero.etiquetas.count() >= MAX_ETIQUETAS:
        raise ReglaDeNegocio(f"Un tablero admite hasta {MAX_ETIQUETAS} etiquetas.")
    orden = (tablero.etiquetas.aggregate(m=Max("orden"))["m"] or 0) + 1
    if _repetida(tablero.pk, nombre.strip()[:40]):
        raise ReglaDeNegocio(f"Ya hay una etiqueta «{nombre.strip()}» en este tablero.")
    try:
        with transaction.atomic():
            return Etiqueta.objects.create(tablero=tablero, nombre=nombre.strip()[:40], color=color.lower(), orden=orden)
    except IntegrityError:
        raise ReglaDeNegocio(f"Ya hay una etiqueta «{nombre.strip()}» en este tablero.")


def editar_etiqueta(etiqueta: Etiqueta, *, nombre: str | None = None, color: str | None = None) -> Etiqueta:
    _validar(nombre, color)
    if nombre is not None:
        etiqueta.nombre = nombre.strip()[:40]
        if _repetida(etiqueta.tablero_id, etiqueta.nombre, excepto=etiqueta.pk):
            raise ReglaDeNegocio(f"Ya hay una etiqueta «{etiqueta.nombre}» en este tablero.")
    if color is not None:
        etiqueta.color = color.lower()
    try:
        with transaction.atomic():
            etiqueta.save()
    except IntegrityError:
        raise ReglaDeNegocio(f"Ya hay una etiqueta «{etiqueta.nombre}» en este tablero.")
    return etiqueta


def eliminar_etiqueta(etiqueta: Etiqueta) -> None:
    """Configuración del tablero, no dato de negocio: se quita de las tarjetas."""
    etiqueta.delete()
