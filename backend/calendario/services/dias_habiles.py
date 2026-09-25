"""
Días hábiles: lunes a viernes que no son feriado.

Punto único de verdad para duraciones, vencimientos, Gantt y plantillas. Los
feriados de un año se calculan una vez y se guardan en caché; cualquier alta o
baja de `Feriado` invalida la caché (señales en `calendario/signals.py`).
"""

from __future__ import annotations

import datetime

from django.conf import settings
from django.core.cache import cache

from calendario.models import Feriado

_CLAVE_VERSION = "calendario:version"
UN_DIA = datetime.timedelta(days=1)


# --- Feriados ------------------------------------------------------------------


def pascua(anio: int) -> datetime.date:
    """Domingo de Pascua (algoritmo anónimo gregoriano, válido 1583-4099)."""
    a = anio % 19
    b, c = divmod(anio, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    mes, dia = divmod(h + l_ - 7 * m + 114, 31)
    return datetime.date(anio, mes, dia + 1)


def feriados_moviles(anio: int) -> list[tuple[datetime.date, str]]:
    """Carnaval (lunes y martes) y Semana Santa (jueves y viernes)."""
    domingo = pascua(anio)
    return [
        (domingo - datetime.timedelta(days=48), "Lunes de Carnaval"),
        (domingo - datetime.timedelta(days=47), "Martes de Carnaval"),
        (domingo - datetime.timedelta(days=3), "Jueves Santo"),
        (domingo - datetime.timedelta(days=2), "Viernes Santo"),
    ]


def invalidar_cache() -> None:
    try:
        cache.incr(_CLAVE_VERSION)
    except ValueError:
        cache.set(_CLAVE_VERSION, 2, None)


def feriados_del_anio(anio: int) -> list[dict]:
    """[{fecha, nombre, tipo: fijo|puntual|movil, id}] ordenados por fecha."""
    version = cache.get_or_set(_CLAVE_VERSION, 1, None)
    clave = f"calendario:feriados:{anio}:{version}"
    en_cache = cache.get(clave)
    if en_cache is not None:
        return en_cache

    lista: list[dict] = []
    for f in Feriado.objects.filter(recurrente=True):
        try:
            fecha = f.fecha.replace(year=anio)
        except ValueError:  # 29 de febrero en año no bisiesto
            continue
        lista.append({"fecha": fecha, "nombre": f.nombre, "tipo": "fijo", "id": f.pk})
    for f in Feriado.objects.filter(recurrente=False, fecha__year=anio):
        lista.append({"fecha": f.fecha, "nombre": f.nombre, "tipo": "puntual", "id": f.pk})
    if getattr(settings, "CALENDARIO_FERIADOS_MOVILES", True):
        ocupadas = {x["fecha"] for x in lista}
        lista.extend(
            {"fecha": fecha, "nombre": nombre, "tipo": "movil", "id": None}
            for fecha, nombre in feriados_moviles(anio)
            if fecha not in ocupadas
        )
    lista.sort(key=lambda x: x["fecha"])
    cache.set(clave, lista, 60 * 60 * 24)
    return lista


def _fechas_feriado(anio: int) -> frozenset[datetime.date]:
    return frozenset(x["fecha"] for x in feriados_del_anio(anio))


def feriados_entre(desde: datetime.date, hasta: datetime.date) -> list[dict]:
    resultado = []
    for anio in range(desde.year, hasta.year + 1):
        resultado.extend(x for x in feriados_del_anio(anio) if desde <= x["fecha"] <= hasta)
    return resultado


# --- Días hábiles ------------------------------------------------------------------


def es_habil(fecha: datetime.date) -> bool:
    return fecha.weekday() < 5 and fecha not in _fechas_feriado(fecha.year)


def dias_habiles_hasta(desde: datetime.date, hasta: datetime.date) -> int:
    """Días hábiles DESPUÉS de `desde` hasta `hasta` inclusive (0 si hasta <= desde)."""
    dias = 0
    actual = desde
    while actual < hasta:
        actual += UN_DIA
        if es_habil(actual):
            dias += 1
    return dias


def duracion_habil(inicio: datetime.date, fin: datetime.date) -> int:
    """Días hábiles entre inicio y fin, ambos incluidos (mínimo 1)."""
    return max(1, dias_habiles_hasta(inicio - UN_DIA, fin))


def siguiente_habil(fecha: datetime.date) -> datetime.date:
    """El mismo día si es hábil; si no, el siguiente hábil."""
    while not es_habil(fecha):
        fecha += UN_DIA
    return fecha


def sumar_habiles(fecha: datetime.date, dias: int) -> datetime.date:
    """Avanza (o retrocede con `dias` negativo) contando solo días hábiles."""
    paso = UN_DIA if dias >= 0 else -UN_DIA
    restantes = abs(dias)
    while restantes:
        fecha += paso
        if es_habil(fecha):
            restantes -= 1
    return fecha


def fin_desde_inicio(inicio: datetime.date, duracion: int) -> datetime.date:
    """Fecha final para una duración en días hábiles que empieza en `inicio`."""
    inicio = siguiente_habil(inicio)
    return sumar_habiles(inicio, max(1, duracion) - 1)
