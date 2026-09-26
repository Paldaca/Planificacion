"""Columnas: alta, orden, columna final y archivo (sin perder tarjetas)."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from core.errores import ConflictoDeVersion, ReglaDeNegocio
from tableros.models import Card, Columna

from . import vencimientos


@transaction.atomic
def crear_columna(tablero, *, nombre: str) -> Columna:
    ultimo = tablero.columnas.activas().aggregate(m=Max("orden"))["m"]
    return Columna.objects.create(tablero=tablero, nombre=nombre[:60], orden=(ultimo or 0) + 1)


@transaction.atomic
def reordenar_columnas(tablero, *, ids: list[int]) -> list[Columna]:
    columnas = {c.pk: c for c in tablero.columnas.activas().select_for_update()}
    if sorted(ids) != sorted(columnas):
        raise ReglaDeNegocio("La lista de columnas no coincide con las del tablero.")
    for orden, pk in enumerate(ids):
        columnas[pk].orden = orden
    Columna.objects.bulk_update(columnas.values(), ["orden"])
    return [columnas[pk] for pk in ids]


@transaction.atomic
def editar_columna(columna: Columna, *, version: int, **cambios) -> Columna:
    """`cambios`: nombre, es_final, incluir_en_gantt, limite_cards (None =
    sin límite). Lanza ConflictoDeVersion."""
    columna = Columna.objects.select_for_update().get(pk=columna.pk)
    if version != columna.version:
        raise ConflictoDeVersion(columna)
    cambia_final = "es_final" in cambios and cambios["es_final"] != columna.es_final
    if cambia_final:
        columna.es_final = cambios["es_final"]
        cards = columna.cards.filter(archivada=False)
        if columna.es_final:
            cards.filter(completada_en__isnull=True).update(completada_en=timezone.now())
        else:
            cards.update(completada_en=None)
    for campo in ("nombre", "incluir_en_gantt", "limite_cards"):
        if campo in cambios:
            setattr(columna, campo, cambios[campo])
    columna.version += 1
    columna.save()
    if cambia_final:
        vencimientos.sincronizar_columna(columna)
    return columna


@transaction.atomic
def archivar_columna(columna: Columna, *, destino: Columna | None) -> None:
    activas = list(columna.tablero.columnas.activas().select_for_update())
    if len(activas) <= 1:
        raise ReglaDeNegocio("El tablero necesita al menos una columna.")
    pendientes = list(columna.cards.filter(archivada=False).order_by("orden", "id"))
    if pendientes:
        if destino is None:
            raise ReglaDeNegocio("Elige a qué columna mover sus tarjetas.")
        if destino.pk == columna.pk or destino.tablero_id != columna.tablero_id or destino.archivada:
            raise ReglaDeNegocio("La columna destino no es válida.")
        base = (destino.cards.filter(archivada=False).aggregate(m=Max("orden"))["m"] or 0) + 1
        ahora = timezone.now()
        for i, card in enumerate(pendientes):
            card.columna = destino
            card.orden = base + i
            card.alinear_con_columna(destino, ahora)
        Card.objects.bulk_update(pendientes, ["columna", "orden", "completada_en"])
    columna.archivada = True
    columna.version += 1
    columna.save(update_fields=["archivada", "version"])
    if destino is not None:
        vencimientos.sincronizar_columna(destino)
