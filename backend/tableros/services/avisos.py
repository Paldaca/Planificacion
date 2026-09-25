"""
Avisos de Planificación en la campana del Portal (docs/plan-modulo-planificacion.md §6.3).

Aquí se decide QUÉ se avisa, A QUIÉN y CON QUÉ TEXTO; el transporte (firma,
bandeja de salida, reintentos) es de `integracion_portal.services.notificaciones`.
Los avisos de vencimiento viven en `vencimientos.py`.

Reglas comunes:
- Nunca se avisa a quien provocó el hecho.
- Solo a personas que hoy pueden ver el tablero (un exmiembro no recibe nada).
- Cada aviso lleva el enlace directo a la tarjeta dentro del Portal.
"""

from __future__ import annotations

import datetime

from integracion_portal.services import notificaciones as n
from integracion_portal.services.personas import nombre
from tableros import permisos

MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
EXTRACTO = 140


def dia(fecha: datetime.date) -> str:
    return f"{fecha.day} {MESES[fecha.month - 1]}"


def ruta(card) -> str:
    return f"/tableros/{card.tablero_id}/cards/{card.numero}"


def donde(card) -> str:
    tablero = card.tablero
    return f"{tablero.nombre} · {tablero.equipo.nombre}" if tablero.equipo_id else tablero.nombre


def extracto(texto: str) -> str:
    texto = " ".join(texto.split())
    return texto if len(texto) <= EXTRACTO else texto[: EXTRACTO - 1].rstrip() + "…"


def con_acceso(card, usuarios) -> list:
    return [u for u in usuarios if permisos.puede_ver_tablero(u, card.tablero)]


def avisar_asignacion(card, nuevos, actor) -> None:
    destinatarios = con_acceso(card, nuevos)
    if not destinatarios:
        return
    cuerpo = f"{nombre(actor)} te hizo responsable en {donde(card)}."
    if card.fecha_fin:
        cuerpo += f" Fecha final: {dia(card.fecha_fin)}."
    n.emitir(
        codigo=n.CARD_ASIGNADA,
        titulo=f"Te asignaron «{card.titulo}»",
        cuerpo=cuerpo,
        destinatarios=destinatarios,
        actor=actor,
        ruta=ruta(card),
    )


def avisar_menciones(comentario, mencionados, actor) -> list:
    """Avisa a los mencionados con acceso al tablero. Devuelve a quiénes."""
    card = comentario.card
    mencionados = [u for u in con_acceso(card, mencionados) if u.pk != getattr(actor, "pk", None)]
    if mencionados:
        n.emitir(
            codigo=n.MENCION,
            titulo=f"{nombre(actor)} te mencionó en «{card.titulo}»",
            cuerpo=f"«{extracto(comentario.texto)}» — {donde(card)}",
            destinatarios=mencionados,
            actor=actor,
            ruta=ruta(card),
        )
    return mencionados


def avisar_comentario(comentario, mencionados, actor) -> None:
    """Mencionados reciben SOLO la mención; los demás responsables, el comentario."""
    card = comentario.card
    avisados = {u.pk for u in avisar_menciones(comentario, mencionados, actor)}
    responsables = con_acceso(card, [a.usuario for a in card.asignaciones.select_related("usuario")])
    responsables = [u for u in responsables if u.pk not in avisados]
    if responsables:
        n.emitir(
            codigo=n.COMENTARIO_NUEVO,
            titulo=f"Nuevo comentario en «{card.titulo}»",
            cuerpo=f"{nombre(actor)}: «{extracto(comentario.texto)}» — {donde(card)}",
            destinatarios=responsables,
            actor=actor,
            ruta=ruta(card),
        )
