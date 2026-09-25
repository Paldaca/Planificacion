"""
Vencimiento de las tarjetas: el estado que se MUESTRA y los avisos al Portal.

- `vencimiento()`: terminada | sin_fecha | vencida | vence_pronto | al_dia.
  Nunca se guarda; se calcula al serializar.
- Avisos: UNA vez por estado (por vencer, vencida). El cron
  (`manage.py revisar_vencimientos`) emite las transiciones; cualquier cambio
  que deje sin efecto el estado avisado (terminar, archivar, mover la fecha)
  lo resuelve al instante. Reemitir con la misma clave marcaría el aviso como
  no leído en el Portal, por eso nunca se reemite a diario.
- El umbral de «vence pronto» es el del tipo de aviso en el Portal (editable
  sin deploy), así tarjeta y aviso siempre coinciden. Días hábiles según
  `calendario` (fines de semana y feriados).
"""

from __future__ import annotations

import datetime

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from calendario.services.dias_habiles import dias_habiles_hasta
from integracion_portal.services import notificaciones as n
from tableros.models import AvisoVencimiento, Card

from .avisos import con_acceso, dia, donde, ruta

DIAS_HABILES_VENCE_PRONTO = 2

_CODIGOS = {
    AvisoVencimiento.POR_VENCER: n.CARD_POR_VENCER,
    AvisoVencimiento.VENCIDA: n.CARD_VENCIDA,
}


def umbral_por_vencer() -> int:
    """Días hábiles de «vence pronto»: el del Portal o 2."""
    config = n.config_tipo(n.CARD_POR_VENCER) or {}
    valor = config.get("umbral_dias")
    return valor if isinstance(valor, int) and valor >= 0 else DIAS_HABILES_VENCE_PRONTO


def vencimiento(card, hoy: datetime.date | None = None, umbral: int = DIAS_HABILES_VENCE_PRONTO) -> str:
    if card.completada_en is not None or card.columna.es_final:
        return "terminada"
    if card.fecha_fin is None:
        return "sin_fecha"
    hoy = hoy or timezone.localdate()
    if card.fecha_fin < hoy:
        return "vencida"
    if dias_habiles_hasta(hoy, card.fecha_fin) <= umbral:
        return "vence_pronto"
    return "al_dia"


def estado_aviso(card, hoy: datetime.date, umbral: int) -> str:
    tablero = card.tablero
    if (
        card.archivada
        or card.completada_en is not None
        or card.fecha_fin is None
        or tablero.archivado
        or (tablero.equipo_id and tablero.equipo.archivado)
    ):
        return AvisoVencimiento.NINGUNO
    if card.fecha_fin < hoy:
        return AvisoVencimiento.VENCIDA
    if dias_habiles_hasta(hoy, card.fecha_fin) <= umbral:
        return AvisoVencimiento.POR_VENCER
    return AvisoVencimiento.NINGUNO


def _clave(estado: str, card) -> str:
    return f"card_{estado}:{card.pk}"


def _resolver_actual(card) -> None:
    if card.aviso_vencimiento:
        n.resolver(codigo=_CODIGOS[card.aviso_vencimiento], clave_agrupacion=_clave(card.aviso_vencimiento, card))


def sincronizar(card, umbral: int | None = None) -> None:
    """Tras un cambio interactivo: resuelve el aviso si su estado ya no aplica.

    No emite: las emisiones son del cron, una vez al día y por transición."""
    if not card.aviso_vencimiento:
        return
    umbral = umbral_por_vencer() if umbral is None else umbral
    if estado_aviso(card, timezone.localdate(), umbral) == card.aviso_vencimiento:
        return
    _resolver_actual(card)
    Card.objects.filter(pk=card.pk).update(aviso_vencimiento=AvisoVencimiento.NINGUNO)
    card.aviso_vencimiento = AvisoVencimiento.NINGUNO


def sincronizar_columna(columna) -> None:
    umbral = None
    for card in columna.cards.exclude(aviso_vencimiento="").select_related("tablero__equipo"):
        umbral = umbral_por_vencer() if umbral is None else umbral
        sincronizar(card, umbral)


def _emitir(card, estado: str) -> None:
    responsables = con_acceso(card, [a.usuario for a in card.asignaciones.all()])
    if estado == AvisoVencimiento.VENCIDA:
        titulo = f"«{card.titulo}» está vencida"
        cuerpo = f"Venció el {dia(card.fecha_fin)} en {donde(card)}. Termínala o ajusta su fecha."
    else:
        hoy = timezone.localdate()
        cuando = "hoy" if card.fecha_fin == hoy else (
            "mañana" if card.fecha_fin == hoy + datetime.timedelta(days=1) else f"el {dia(card.fecha_fin)}"
        )
        titulo = f"«{card.titulo}» vence {cuando}"
        cuerpo = f"Tarjeta de {donde(card)} donde eres responsable."
    n.emitir(
        codigo=_CODIGOS[estado],
        titulo=titulo,
        cuerpo=cuerpo,
        destinatarios=responsables,
        ruta=ruta(card),
        clave_agrupacion=_clave(estado, card),
    )


def revisar(hoy: datetime.date | None = None) -> dict:
    """Emite y resuelve según el estado de cada card. Idempotente en el día."""
    hoy = hoy or timezone.localdate()
    umbral = umbral_por_vencer()
    candidatas = (
        Card.objects.filter(
            Q(fecha_fin__isnull=False, archivada=False, completada_en__isnull=True) | ~Q(aviso_vencimiento="")
        )
        .select_related("tablero__equipo")
        .prefetch_related("asignaciones__usuario")
    )
    resumen = {"revisadas": 0, "avisadas": 0, "resueltas": 0}
    for card in candidatas:
        resumen["revisadas"] += 1
        estado = estado_aviso(card, hoy, umbral)
        if estado == card.aviso_vencimiento:
            continue
        with transaction.atomic():
            if card.aviso_vencimiento:
                _resolver_actual(card)
                resumen["resueltas"] += 1
            if estado:
                _emitir(card, estado)
                resumen["avisadas"] += 1
            Card.objects.filter(pk=card.pk).update(aviso_vencimiento=estado)
    return resumen
