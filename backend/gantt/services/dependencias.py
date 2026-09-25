"""
Dependencias: alta sin ciclos, baja y la restricción que cada una impone.

Semántica (días hábiles, `desfase` puede ser negativo):
- fin → inicio:     la sucesora empieza  >= día hábil siguiente al fin + desfase
- inicio → inicio:  la sucesora empieza  >= inicio de la predecesora + desfase
- fin → fin:        la sucesora termina  >= fin de la predecesora + desfase
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from django.db import IntegrityError, transaction

from calendario.services.dias_habiles import siguiente_habil, sumar_habiles
from core.errores import ReglaDeNegocio
from gantt.models import Dependencia, TipoDependencia
from tableros.models import Actividad, Card
from tableros.services import actividad

MAX_DESFASE = 365


@dataclass(frozen=True)
class Restriccion:
    """La sucesora debe tener `campo` (inicio | fin) no antes de `fecha`."""

    campo: str
    fecha: datetime.date


def restriccion(tipo: str, desfase: int, predecesora: Card) -> Restriccion | None:
    """None si a la predecesora le faltan las fechas que la regla necesita."""
    if tipo == TipoDependencia.INICIO_INICIO:
        if predecesora.fecha_inicio is None:
            return None
        return Restriccion("inicio", sumar_habiles(siguiente_habil(predecesora.fecha_inicio), desfase))
    if predecesora.fecha_fin is None:
        return None
    if tipo == TipoDependencia.FIN_FIN:
        return Restriccion("fin", sumar_habiles(predecesora.fecha_fin, desfase))
    return Restriccion("inicio", sumar_habiles(predecesora.fecha_fin, 1 + desfase))


def viola(r: Restriccion, sucesora: Card) -> bool:
    """Un inicio en día no hábil cuenta como el siguiente hábil (empezar el
    sábado es empezar el lunes)."""
    if r.campo == "inicio":
        return sucesora.fecha_inicio is not None and siguiente_habil(sucesora.fecha_inicio) < r.fecha
    return sucesora.fecha_fin is not None and sucesora.fecha_fin < r.fecha


def incumple(dep: Dependencia, predecesora: Card | None = None, sucesora: Card | None = None) -> bool:
    """La sucesora (con fechas) empieza/termina antes de lo que la dependencia permite."""
    r = restriccion(dep.tipo, dep.desfase_dias, predecesora or dep.predecesora)
    return r is not None and viola(r, sucesora or dep.sucesora)


def _alcanzables_desde(card_id: int) -> set[int]:
    """Ids de todas las sucesoras (directas e indirectas) de `card_id`."""
    vistos: set[int] = set()
    frente = [card_id]
    while frente:
        siguientes = list(
            Dependencia.objects.filter(predecesora_id__in=frente).values_list("sucesora_id", flat=True)
        )
        frente = [i for i in siguientes if i not in vistos]
        vistos.update(frente)
    return vistos


def _titulo(card: Card) -> str:
    return f"#{card.numero} {card.titulo}"


@transaction.atomic
def crear_dependencia(
    *, predecesora: Card, sucesora: Card, actor, tipo: str = TipoDependencia.FIN_INICIO, desfase_dias: int = 0
) -> Dependencia:
    if predecesora.pk == sucesora.pk:
        raise ReglaDeNegocio("Una tarjeta no puede depender de sí misma.")
    if predecesora.tablero_id != sucesora.tablero_id:
        raise ReglaDeNegocio("Solo se pueden enlazar tarjetas del mismo tablero.")
    if predecesora.archivada or sucesora.archivada:
        raise ReglaDeNegocio("No se pueden enlazar tarjetas archivadas.")
    if abs(desfase_dias) > MAX_DESFASE:
        raise ReglaDeNegocio(f"El desfase no puede pasar de {MAX_DESFASE} días hábiles.")
    if predecesora.pk in _alcanzables_desde(sucesora.pk):
        raise ReglaDeNegocio(
            f"{_titulo(sucesora)} ya va antes de {_titulo(predecesora)}: esta dependencia formaría un ciclo."
        )
    try:
        with transaction.atomic():
            dep = Dependencia.objects.create(
                predecesora=predecesora, sucesora=sucesora, tipo=tipo, desfase_dias=desfase_dias, creada_por=actor
            )
    except IntegrityError:
        raise ReglaDeNegocio("Esas tarjetas ya están enlazadas.")
    actividad.registrar(
        sucesora, actor, Actividad.Accion.DEPENDENCIA, cambio="agrego", despues_de=_titulo(predecesora), tipo=tipo
    )
    return dep


@transaction.atomic
def editar_dependencia(dep: Dependencia, *, tipo: str | None = None, desfase_dias: int | None = None) -> Dependencia:
    if desfase_dias is not None:
        if abs(desfase_dias) > MAX_DESFASE:
            raise ReglaDeNegocio(f"El desfase no puede pasar de {MAX_DESFASE} días hábiles.")
        dep.desfase_dias = desfase_dias
    if tipo is not None:
        dep.tipo = tipo
    dep.save(update_fields=["tipo", "desfase_dias"])
    return dep


@transaction.atomic
def eliminar_dependencia(dep: Dependencia, *, actor) -> None:
    actividad.registrar(
        dep.sucesora, actor, Actividad.Accion.DEPENDENCIA, cambio="quito", despues_de=_titulo(dep.predecesora)
    )
    dep.delete()
