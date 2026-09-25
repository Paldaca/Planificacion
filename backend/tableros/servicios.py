"""
Operaciones de tableros que tocan varias filas a la vez.

Las vistas solo validan permisos y formato; todo lo que tiene que quedar
consistente (numeración de cards, orden dentro de columnas, `completada_en`
según la columna final) pasa por aquí, dentro de una transacción.
"""

from __future__ import annotations

import datetime

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone

from .models import COLUMNAS_PREDETERMINADAS, Card, Columna, Tablero, TipoTablero

NOMBRE_TABLERO_PERSONAL = "Mi tablero"
DIAS_HABILES_VENCE_PRONTO = 2


class ReglaDeNegocio(Exception):
    """Operación válida en formato pero no permitida por las reglas (-> 400)."""


# --- Tableros -----------------------------------------------------------------


@transaction.atomic
def crear_tablero(*, nombre, creado_por, tipo, propietario=None, equipo=None, descripcion=""):
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


# --- Columnas -----------------------------------------------------------------


def columnas_activas(tablero):
    return tablero.columnas.filter(archivada=False).order_by("orden", "id")


@transaction.atomic
def crear_columna(tablero, nombre) -> Columna:
    ultimo = columnas_activas(tablero).aggregate(m=Max("orden"))["m"]
    return Columna.objects.create(tablero=tablero, nombre=nombre, orden=(ultimo or 0) + 1)


@transaction.atomic
def reordenar_columnas(tablero, ids: list[int]) -> None:
    columnas = {c.pk: c for c in columnas_activas(tablero).select_for_update()}
    if sorted(ids) != sorted(columnas):
        raise ReglaDeNegocio("La lista de columnas no coincide con las del tablero.")
    for orden, pk in enumerate(ids):
        columnas[pk].orden = orden
    Columna.objects.bulk_update(columnas.values(), ["orden"])


@transaction.atomic
def marcar_final(columna: Columna, es_final: bool) -> None:
    """Cambia si la columna es final y alinea `completada_en` de sus cards."""
    columna.es_final = es_final
    columna.save(update_fields=["es_final"])
    ahora = timezone.now()
    cards = columna.cards.filter(archivada=False)
    if es_final:
        cards.filter(completada_en__isnull=True).update(completada_en=ahora)
    else:
        cards.update(completada_en=None)


@transaction.atomic
def archivar_columna(columna: Columna, destino: Columna | None) -> None:
    activas = list(columnas_activas(columna.tablero).select_for_update())
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
            _ajustar_completada(card, destino, ahora)
        Card.objects.bulk_update(pendientes, ["columna", "orden", "completada_en"])
    columna.archivada = True
    columna.version += 1
    columna.save(update_fields=["archivada", "version"])


# --- Cards --------------------------------------------------------------------


def _ajustar_completada(card: Card, columna: Columna, ahora) -> None:
    if columna.es_final:
        card.completada_en = card.completada_en or ahora
    else:
        card.completada_en = None


@transaction.atomic
def crear_card(*, tablero: Tablero, columna: Columna, titulo: str, creada_por, **campos) -> Card:
    responsables = campos.pop("responsables", None) or []
    bloqueado = Tablero.objects.select_for_update().get(pk=tablero.pk)
    numero = bloqueado.siguiente_numero_card
    bloqueado.siguiente_numero_card = numero + 1
    bloqueado.save(update_fields=["siguiente_numero_card"])
    ultimo = columna.cards.filter(archivada=False).aggregate(m=Max("orden"))["m"]
    card = Card(
        tablero=tablero,
        columna=columna,
        numero=numero,
        titulo=titulo,
        orden=(ultimo if ultimo is not None else -1) + 1,
        creada_por=creada_por,
        **campos,
    )
    _ajustar_completada(card, columna, timezone.now())
    card.save()
    asignar_responsables(card, responsables, por=creada_por)
    return card


def asignar_responsables(card: Card, usuarios, *, por) -> list:
    """Deja exactamente `usuarios` como responsables. Devuelve los NUEVOS."""
    from .models import ResponsableCard

    deseados = {u.pk: u for u in usuarios}
    actuales = set(card.asignaciones.values_list("usuario_id", flat=True))
    card.asignaciones.exclude(usuario_id__in=deseados).delete()
    nuevos = [u for pk, u in deseados.items() if pk not in actuales]
    ResponsableCard.objects.bulk_create(
        [ResponsableCard(card=card, usuario=u, asignado_por=por) for u in nuevos]
    )
    return nuevos


@transaction.atomic
def mover_card(card: Card, destino: Columna, posicion: int) -> Card:
    if destino.tablero_id != card.tablero_id or destino.archivada:
        raise ReglaDeNegocio("La columna destino no es válida.")
    origen_id = card.columna_id
    en_destino = list(
        destino.cards.select_for_update()
        .filter(archivada=False)
        .exclude(pk=card.pk)
        .order_by("orden", "id")
    )
    posicion = max(0, min(int(posicion), len(en_destino)))
    en_destino.insert(posicion, card)
    card.columna = destino
    _ajustar_completada(card, destino, timezone.now())
    for i, c in enumerate(en_destino):
        c.orden = i
    Card.objects.bulk_update(en_destino, ["orden"])
    card.save(update_fields=["columna", "orden", "completada_en", "actualizado_en"])
    if origen_id != destino.pk:
        restantes = list(
            Card.objects.filter(columna_id=origen_id, archivada=False).order_by("orden", "id")
        )
        for i, c in enumerate(restantes):
            c.orden = i
        Card.objects.bulk_update(restantes, ["orden"])
    return card


@transaction.atomic
def archivar_card(card: Card) -> None:
    card.archivada = True
    card.archivada_en = timezone.now()
    card.save(update_fields=["archivada", "archivada_en", "actualizado_en"])


@transaction.atomic
def restaurar_card(card: Card) -> Card:
    columna = card.columna
    if columna.archivada:
        columna = columnas_activas(card.tablero).first()
    ultimo = columna.cards.filter(archivada=False).aggregate(m=Max("orden"))["m"]
    card.columna = columna
    card.orden = (ultimo if ultimo is not None else -1) + 1
    card.archivada = False
    card.archivada_en = None
    _ajustar_completada(card, columna, timezone.now())
    card.save()
    return card


# --- Vencimiento ----------------------------------------------------------------


def dias_habiles_hasta(hoy: datetime.date, fin: datetime.date) -> int:
    """Días hábiles (lun-vie) después de `hoy` hasta `fin` inclusive.

    Feriados: fase 3 (calendario laboral)."""
    dias = 0
    actual = hoy
    while actual < fin:
        actual += datetime.timedelta(days=1)
        if actual.weekday() < 5:
            dias += 1
    return dias


def vencimiento(card: Card, hoy: datetime.date | None = None) -> str:
    """terminada | sin_fecha | vencida | vence_pronto | al_dia. Nunca se guarda."""
    if card.completada_en is not None or card.columna.es_final:
        return "terminada"
    if card.fecha_fin is None:
        return "sin_fecha"
    hoy = hoy or timezone.localdate()
    if card.fecha_fin < hoy:
        return "vencida"
    if dias_habiles_hasta(hoy, card.fecha_fin) <= DIAS_HABILES_VENCE_PRONTO:
        return "vence_pronto"
    return "al_dia"
