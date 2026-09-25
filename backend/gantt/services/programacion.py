"""
Reprogramar desde el Gantt: cambiar las fechas de una tarjeta y, si se pide,
empujar sus sucesoras para que ninguna dependencia quede incumplida.

- Solo se empuja HACIA ADELANTE (adelantar una tarea no arrastra a las demás).
- La sucesora conserva su duración en días hábiles.
- No se mueven tarjetas terminadas ni sin fechas.
- Cada cambio pasa por `tarjetas.editar_card`: mismo historial, avisos y
  control de vencimientos que una edición a mano.
"""

from __future__ import annotations

import datetime
from collections import deque

from django.db import transaction

from calendario.services.dias_habiles import duracion_habil, fin_desde_inicio, siguiente_habil, sumar_habiles
from core.errores import ReglaDeNegocio
from gantt.models import Dependencia
from tableros.models import Card
from tableros.services import tarjetas

from .dependencias import restriccion, viola

#: Freno de seguridad: un tablero razonable nunca mueve tantas en cadena.
MAX_MOVIMIENTOS = 500


def _nuevas_fechas(card: Card, campo: str, minimo: datetime.date) -> tuple[datetime.date, datetime.date]:
    duracion = duracion_habil(card.fecha_inicio, card.fecha_fin)
    if campo == "inicio":
        inicio = siguiente_habil(minimo)
        return inicio, fin_desde_inicio(inicio, duracion)
    fin = minimo
    return sumar_habiles(fin, -(duracion - 1)), fin


@transaction.atomic
def programar(
    card: Card,
    *,
    actor,
    version: int,
    fecha_inicio: datetime.date | None,
    fecha_fin: datetime.date | None,
    mover_sucesoras: bool = True,
) -> list[Card]:
    """Devuelve las tarjetas cambiadas (la primera es `card`). Puede lanzar
    ConflictoDeVersion (la versión de `card` está vieja) o ValidationError."""
    if card.archivada:
        raise ReglaDeNegocio("Restaura la tarjeta antes de cambiar sus fechas.")
    card = tarjetas.editar_card(card, actor=actor, version=version, fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
    cambiadas = {card.pk: card}
    if not mover_sucesoras:
        return [card]

    pendientes = deque([card])
    while pendientes and len(cambiadas) < MAX_MOVIMIENTOS:
        pred = pendientes.popleft()
        deps = Dependencia.objects.filter(predecesora=pred, sucesora__archivada=False).select_related("sucesora__columna")
        for dep in deps:
            suc = cambiadas.get(dep.sucesora_id) or dep.sucesora
            if suc.completada_en is not None or suc.fecha_inicio is None or suc.fecha_fin is None:
                continue
            r = restriccion(dep.tipo, dep.desfase_dias, pred)
            if r is None:
                continue
            if not viola(r, suc):
                continue
            inicio, fin = _nuevas_fechas(suc, r.campo, r.fecha)
            suc = tarjetas.editar_card(
                suc, actor=actor, version=Card.objects.get(pk=suc.pk).version, fecha_inicio=inicio, fecha_fin=fin
            )
            cambiadas[suc.pk] = suc
            pendientes.append(suc)
    return list(cambiadas.values())
