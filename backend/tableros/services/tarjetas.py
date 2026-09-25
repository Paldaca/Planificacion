"""
Tarjetas: alta, edición, movimiento, archivo y traslado entre tableros.

Cada operación deja todo consistente en UNA transacción: numeración y orden
dentro de la columna, `completada_en` según la columna final, historial
(`actividad`), avisos al Portal (`avisos`) y el estado de vencimiento avisado
(`vencimientos`). Las vistas solo validan formato y permisos.
"""

from __future__ import annotations

from collections.abc import Iterable

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from core.errores import ConflictoDeVersion, ReglaDeNegocio
from tableros.models import Actividad, Card, Columna, ResponsableCard, Tablero
from tableros.signals import tarjeta_trasladada

from . import actividad, avisos, vencimientos

#: Campos que se copian tal cual desde la petición.
CAMPOS_EDITABLES = ("titulo", "descripcion", "fecha_inicio", "fecha_fin", "urgencia", "en_gantt")


# --- Piezas internas ------------------------------------------------------------


def _tomar_numero(tablero: Tablero) -> int:
    bloqueado = Tablero.objects.select_for_update().get(pk=tablero.pk)
    numero = bloqueado.siguiente_numero_card
    bloqueado.siguiente_numero_card = numero + 1
    bloqueado.save(update_fields=["siguiente_numero_card"])
    return numero


def _al_final_de(columna: Columna) -> int:
    ultimo = columna.cards.filter(archivada=False).aggregate(m=Max("orden"))["m"]
    return (ultimo if ultimo is not None else -1) + 1


def _compactar(columna_id: int) -> None:
    restantes = list(Card.objects.filter(columna_id=columna_id, archivada=False).order_by("orden", "id"))
    for i, c in enumerate(restantes):
        c.orden = i
    Card.objects.bulk_update(restantes, ["orden"])


def _asignar(card: Card, usuarios: Iterable, *, por) -> tuple[list, list]:
    """Deja exactamente `usuarios` como responsables. Devuelve (nuevos, quitados)."""
    deseados = {u.pk: u for u in usuarios}
    actuales = {a.usuario_id: a.usuario for a in card.asignaciones.select_related("usuario")}
    quitados = [u for pk, u in actuales.items() if pk not in deseados]
    card.asignaciones.exclude(usuario_id__in=deseados).delete()
    nuevos = [u for pk, u in deseados.items() if pk not in actuales]
    ResponsableCard.objects.bulk_create([ResponsableCard(card=card, usuario=u, asignado_por=por) for u in nuevos])
    return nuevos, quitados


def _reubicar(card: Card, destino: Columna, posicion: int) -> None:
    """Coloca la card en `posicion` de `destino` y renumera origen y destino."""
    if destino.tablero_id != card.tablero_id or destino.archivada:
        raise ReglaDeNegocio("La columna destino no es válida.")
    origen_id = card.columna_id
    en_destino = list(
        destino.cards.select_for_update().filter(archivada=False).exclude(pk=card.pk).order_by("orden", "id")
    )
    posicion = max(0, min(int(posicion), len(en_destino)))
    en_destino.insert(posicion, card)
    card.columna = destino
    card.alinear_con_columna(destino, timezone.now())
    for i, c in enumerate(en_destino):
        c.orden = i
    Card.objects.bulk_update(en_destino, ["orden"])
    card.save(update_fields=["columna", "orden", "completada_en", "actualizado_en"])
    if origen_id != destino.pk:
        _compactar(origen_id)


# --- Operaciones ----------------------------------------------------------------


@transaction.atomic
def crear_card(
    *, tablero: Tablero, columna: Columna, titulo: str, actor, responsables: Iterable = (), **campos
) -> Card:
    responsables = list(responsables)
    card = Card(
        tablero=tablero,
        columna=columna,
        numero=_tomar_numero(tablero),
        titulo=titulo,
        orden=_al_final_de(columna),
        creada_por=actor,
        **{c: v for c, v in campos.items() if c in CAMPOS_EDITABLES},
    )
    card.clean()
    card.alinear_con_columna(columna, timezone.now())
    card.save()
    _asignar(card, responsables, por=actor)
    actividad.registrar(card, actor, Actividad.Accion.CREO, columna=columna.nombre)
    avisos.avisar_asignacion(card, responsables, actor)
    return card


@transaction.atomic
def editar_card(
    card: Card, *, actor, version: int, responsables: Iterable | None = None, columna: Columna | None = None, **campos
) -> Card:
    """Edita campos, responsables y (opcional) columna. Lanza ConflictoDeVersion."""
    actual = Card.objects.select_for_update().select_related("tablero__equipo", "columna").get(pk=card.pk)
    if version != actual.version:
        raise ConflictoDeVersion(actual)
    campos = {c: v for c, v in campos.items() if c in CAMPOS_EDITABLES}
    antes = {c: getattr(actual, c) for c in campos}
    for campo, valor in campos.items():
        setattr(actual, campo, valor)
    actual.clean()
    nuevos: list = []
    if responsables is not None:
        nuevos, quitados = _asignar(actual, responsables, por=actor)
        actividad.registrar_responsables(actual, actor, nuevos, quitados)
    actual.version += 1
    actual.save()
    actividad.registrar_ediciones(actual, actor, antes, {c: getattr(actual, c) for c in antes})
    if columna is not None and columna.pk != actual.columna_id:
        desde = actual.columna.nombre
        _reubicar(actual, columna, posicion=10**6)
        actividad.registrar(actual, actor, Actividad.Accion.MOVIO, desde=desde, hacia=columna.nombre)
    avisos.avisar_asignacion(actual, nuevos, actor)
    vencimientos.sincronizar(actual)
    return actual


@transaction.atomic
def mover_card(card: Card, *, destino: Columna, posicion: int, actor) -> Card:
    desde = card.columna
    _reubicar(card, destino, posicion)
    if desde.pk != destino.pk:
        actividad.registrar(card, actor, Actividad.Accion.MOVIO, desde=desde.nombre, hacia=destino.nombre)
    vencimientos.sincronizar(card)
    return card


@transaction.atomic
def archivar_card(card: Card, *, archivada: bool, actor) -> Card:
    if archivada == card.archivada:
        return card
    if archivada:
        card.archivada = True
        card.archivada_en = timezone.now()
        card.save(update_fields=["archivada", "archivada_en", "actualizado_en"])
        _compactar(card.columna_id)
        actividad.registrar(card, actor, Actividad.Accion.ARCHIVO)
    else:
        columna = card.columna
        if columna.archivada:
            columna = card.tablero.columnas.activas().first()
        card.columna = columna
        card.orden = _al_final_de(columna)
        card.archivada = False
        card.archivada_en = None
        card.alinear_con_columna(columna, timezone.now())
        card.save()
        actividad.registrar(card, actor, Actividad.Accion.RESTAURO)
    vencimientos.sincronizar(card)
    return card


@transaction.atomic
def trasladar_card(card: Card, *, destino: Tablero, actor) -> Card:
    """Lleva la card (con comentarios, checklist e historial) a otro tablero.

    Toma un número nuevo en el destino, cae en la columna del mismo nombre o
    en la primera, y conserva solo los responsables que existen allí."""
    if destino.pk == card.tablero_id:
        raise ReglaDeNegocio("La tarjeta ya está en ese tablero.")
    if destino.archivado:
        raise ReglaDeNegocio("Ese tablero está archivado.")
    if destino.es_personal and not card.tablero.es_personal:
        # Una tarjeta del equipo no puede quedar escondida en un tablero privado.
        raise ReglaDeNegocio("Una tarjeta de equipo solo se traslada a otro tablero de equipo.")
    activas = list(destino.columnas.activas())
    if not activas:
        raise ReglaDeNegocio("El tablero destino no tiene columnas.")
    columna = next((c for c in activas if c.nombre.lower() == card.columna.nombre.lower()), activas[0])
    origen, origen_columna = card.tablero, card.columna_id
    card.numero = _tomar_numero(destino)
    card.tablero = destino
    card.columna = columna
    card.orden = _al_final_de(columna)
    card.version += 1
    card.alinear_con_columna(columna, timezone.now())
    card.save()
    permitidos = {p.pk for p in destino.personas_asignables()}
    card.asignaciones.exclude(usuario_id__in=permitidos).delete()
    _compactar(origen_columna)
    actividad.registrar(card, actor, Actividad.Accion.TRASLADO, desde=origen.nombre, hacia=destino.nombre)
    vencimientos.sincronizar(card)
    tarjeta_trasladada.send(sender=Card, card=card, origen=origen)
    return card
