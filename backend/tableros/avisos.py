"""
Avisos de Planificación en la campana del Portal (docs/plan-modulo-planificacion.md §6.3).

Aquí se decide QUÉ se avisa, A QUIÉN y CON QUÉ TEXTO; el transporte (firma,
bandeja de salida, reintentos) es de `integracion_portal.notificaciones`.

Reglas comunes:
- Nunca se avisa a quien provocó el hecho.
- Solo a personas que hoy pueden ver el tablero (un exmiembro no recibe nada).
- Cada aviso lleva el enlace directo a la tarjeta dentro del Portal.

Vencimientos: se avisa UNA vez por estado (por vencer, vencida). El cron
(`manage.py revisar_vencimientos`) emite las transiciones; cualquier cambio
que deje sin efecto el estado avisado (terminar, archivar, mover la fecha)
resuelve el aviso al instante. Emitir de nuevo con la misma clave marcaría el
aviso como no leído en el Portal, por eso nunca se reemite a diario.
"""

from __future__ import annotations

import datetime

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from integracion_portal import notificaciones as n
from integracion_portal.personas import nombre

from . import permisos
from .models import AvisoVencimiento, Card
from .servicios import DIAS_HABILES_VENCE_PRONTO, dias_habiles_hasta

MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
EXTRACTO = 140


def _dia(fecha: datetime.date) -> str:
    return f"{fecha.day} {MESES[fecha.month - 1]}"


def _ruta(card) -> str:
    return f"/tableros/{card.tablero_id}/cards/{card.numero}"


def _donde(card) -> str:
    tablero = card.tablero
    return f"{tablero.nombre} · {tablero.equipo.nombre}" if tablero.equipo_id else tablero.nombre


def _extracto(texto: str) -> str:
    texto = " ".join(texto.split())
    return texto if len(texto) <= EXTRACTO else texto[: EXTRACTO - 1].rstrip() + "…"


def con_acceso(card, usuarios) -> list:
    return [u for u in usuarios if permisos.puede_ver_tablero(u, card.tablero)]


# --- Asignación y comentarios ---------------------------------------------------


def avisar_asignacion(card, nuevos, actor) -> None:
    destinatarios = con_acceso(card, nuevos)
    if not destinatarios:
        return
    cuerpo = f"{nombre(actor)} te hizo responsable en {_donde(card)}."
    if card.fecha_fin:
        cuerpo += f" Fecha final: {_dia(card.fecha_fin)}."
    n.emitir(
        codigo=n.CARD_ASIGNADA,
        titulo=f"Te asignaron «{card.titulo}»",
        cuerpo=cuerpo,
        destinatarios=destinatarios,
        actor=actor,
        ruta=_ruta(card),
    )


def avisar_menciones(comentario, mencionados, actor) -> list:
    """Avisa a los mencionados con acceso al tablero. Devuelve a quiénes."""
    card = comentario.card
    mencionados = [u for u in con_acceso(card, mencionados) if u.pk != getattr(actor, "pk", None)]
    if mencionados:
        n.emitir(
            codigo=n.MENCION,
            titulo=f"{nombre(actor)} te mencionó en «{card.titulo}»",
            cuerpo=f"«{_extracto(comentario.texto)}» — {_donde(card)}",
            destinatarios=mencionados,
            actor=actor,
            ruta=_ruta(card),
        )
    return mencionados


def avisar_comentario(comentario, mencionados, actor) -> None:
    """Mencionados reciben SOLO la mención; los demás responsables, el comentario."""
    card = comentario.card
    extracto = _extracto(comentario.texto)
    mencionados = avisar_menciones(comentario, mencionados, actor)
    ya_avisados = {u.pk for u in mencionados}
    responsables = con_acceso(card, [a.usuario for a in card.asignaciones.select_related("usuario")])
    responsables = [u for u in responsables if u.pk not in ya_avisados]
    if responsables:
        n.emitir(
            codigo=n.COMENTARIO_NUEVO,
            titulo=f"Nuevo comentario en «{card.titulo}»",
            cuerpo=f"{nombre(actor)}: «{extracto}» — {_donde(card)}",
            destinatarios=responsables,
            actor=actor,
            ruta=_ruta(card),
        )


# --- Vencimientos ---------------------------------------------------------------

_CODIGOS = {
    AvisoVencimiento.POR_VENCER: n.CARD_POR_VENCER,
    AvisoVencimiento.VENCIDA: n.CARD_VENCIDA,
}


def umbral_por_vencer() -> int:
    """Días hábiles de «vence pronto»: el del Portal (editable sin deploy) o 2."""
    config = n.config_tipo(n.CARD_POR_VENCER) or {}
    valor = config.get("umbral_dias")
    return valor if isinstance(valor, int) and valor >= 0 else DIAS_HABILES_VENCE_PRONTO


def estado_vencimiento(card, hoy: datetime.date, umbral: int) -> str:
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


def sincronizar_vencimiento(card, umbral: int | None = None) -> None:
    """Tras un cambio interactivo: resuelve el aviso si su estado ya no aplica.

    No emite: las emisiones son del cron, una vez al día y por transición."""
    if not card.aviso_vencimiento:
        return
    umbral = umbral_por_vencer() if umbral is None else umbral
    if estado_vencimiento(card, timezone.localdate(), umbral) == card.aviso_vencimiento:
        return
    _resolver_actual(card)
    Card.objects.filter(pk=card.pk).update(aviso_vencimiento=AvisoVencimiento.NINGUNO)
    card.aviso_vencimiento = AvisoVencimiento.NINGUNO


def sincronizar_columna(columna) -> None:
    umbral = None
    for card in columna.cards.exclude(aviso_vencimiento="").select_related("tablero__equipo"):
        umbral = umbral_por_vencer() if umbral is None else umbral
        sincronizar_vencimiento(card, umbral)


def _emitir_vencimiento(card, estado: str) -> None:
    responsables = con_acceso(card, [a.usuario for a in card.asignaciones.all()])
    if estado == AvisoVencimiento.VENCIDA:
        titulo = f"«{card.titulo}» está vencida"
        cuerpo = f"Venció el {_dia(card.fecha_fin)} en {_donde(card)}. Termínala o ajusta su fecha."
    else:
        hoy = timezone.localdate()
        cuando = "hoy" if card.fecha_fin == hoy else (
            "mañana" if card.fecha_fin == hoy + datetime.timedelta(days=1) else f"el {_dia(card.fecha_fin)}"
        )
        titulo = f"«{card.titulo}» vence {cuando}"
        cuerpo = f"Tarjeta de {_donde(card)} donde eres responsable."
    n.emitir(
        codigo=_CODIGOS[estado],
        titulo=titulo,
        cuerpo=cuerpo,
        destinatarios=responsables,
        ruta=_ruta(card),
        clave_agrupacion=_clave(estado, card),
    )


def revisar_vencimientos(hoy: datetime.date | None = None) -> dict:
    """Emite y resuelve según el estado de cada card. Idempotente: correrlo dos
    veces el mismo día no genera avisos nuevos."""
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
        estado = estado_vencimiento(card, hoy, umbral)
        if estado == card.aviso_vencimiento:
            continue
        with transaction.atomic():
            if card.aviso_vencimiento:
                _resolver_actual(card)
                resumen["resueltas"] += 1
            if estado:
                _emitir_vencimiento(card, estado)
                resumen["avisadas"] += 1
            Card.objects.filter(pk=card.pk).update(aviso_vencimiento=estado)
    return resumen
