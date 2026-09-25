"""Checklist de una tarjeta; cada cambio queda en el historial."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Max

from core.errores import ReglaDeNegocio
from tableros.models import Actividad, Card, ItemChecklist

from . import actividad

MAX_ITEMS = 100


@transaction.atomic
def agregar_item(card: Card, *, texto: str, actor) -> ItemChecklist:
    if card.checklist.count() >= MAX_ITEMS:
        raise ReglaDeNegocio(f"El checklist admite hasta {MAX_ITEMS} elementos.")
    ultimo = card.checklist.aggregate(m=Max("orden"))["m"]
    item = ItemChecklist.objects.create(
        card=card, texto=texto[:300], orden=(ultimo if ultimo is not None else -1) + 1, creado_por=actor
    )
    actividad.registrar(card, actor, Actividad.Accion.CHECKLIST, cambio="agrego", texto=item.texto)
    return item


@transaction.atomic
def editar_item(item: ItemChecklist, *, actor, texto: str | None = None, hecho: bool | None = None) -> ItemChecklist:
    if texto is not None:
        item.texto = texto[:300]
    if hecho is not None and hecho != item.hecho:
        item.hecho = hecho
        item.hecho_por = actor if hecho else None
        actividad.registrar(
            item.card, actor, Actividad.Accion.CHECKLIST, cambio="marco" if hecho else "desmarco", texto=item.texto
        )
    item.save()
    return item


@transaction.atomic
def eliminar_item(item: ItemChecklist, *, actor) -> None:
    actividad.registrar(item.card, actor, Actividad.Accion.CHECKLIST, cambio="elimino", texto=item.texto)
    item.delete()
