"""Alta y baja de feriados. La caché de días hábiles se invalida por señal
(`calendario/signals.py`), así también cubre los cambios hechos desde el admin."""

from __future__ import annotations

import datetime

from calendario.models import Feriado


def crear_feriado(*, fecha: datetime.date, nombre: str, recurrente: bool, creado_por) -> Feriado:
    return Feriado.objects.create(fecha=fecha, nombre=nombre, recurrente=recurrente, creado_por=creado_por)


def eliminar_feriado(feriado: Feriado) -> None:
    feriado.delete()
