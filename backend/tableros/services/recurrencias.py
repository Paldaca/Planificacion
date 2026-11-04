"""
Tarjetas recurrentes: una tarjeta que se repite cada N semanas o meses, como
recordatorio de algo que se hace en una fecha fija (un respaldo, el informe
del mes, un mantenimiento programado).

- Nace de una tarjeta («Repetir…»): esa tarjeta es la primera de la serie y
  lo que tiene (título, descripción, columna, urgencia, responsables,
  etiquetas, campos y checklist) es el **modelo** de las siguientes.
- Cada tarjeta vence en su fecha (si no es día hábil, el hábil anterior) y se
  crea `anticipacion` días hábiles antes, con el periodo en el título
  («Respaldo · noviembre 2026»).
- `proxima` guarda la fecha **sin ajustar** a día hábil: así una serie que
  vence el 31 sigue venciendo el último día de cada mes aunque un mes caiga
  en domingo.
- Una sola tarjeta por fecha (`una_card_por_ocurrencia`) y la serie se
  bloquea mientras crea: `generar` es idempotente aunque corra dos veces.
- Si la anterior no se terminó, la nueva se crea igual: cada periodo es su
  propia obligación (la anterior ya avisa que está vencida).
- La crea el comando diario `revisar_vencimientos`, antes de revisar los
  vencimientos.
"""

from __future__ import annotations

import calendar
import datetime

from django.db import transaction
from django.utils import timezone

from calendario.services.dias_habiles import es_habil
from core.errores import ReglaDeNegocio
from tableros.models import Card, Frecuencia, Recurrencia, Tablero

from . import avisos, campos as servicio_campos, checklist as servicio_checklist, tarjetas

MAX_INTERVALO = 12
MAX_ANTICIPACION = 30
#: Tarjetas que una serie crea como mucho en una corrida (si el comando dejó
#: de correr un tiempo, no se inunda el tablero).
MAX_POR_CORRIDA = 12
MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)
DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")


# --- Fechas -----------------------------------------------------------------------------


def _anterior_habil(fecha: datetime.date) -> datetime.date:
    while not es_habil(fecha):
        fecha -= datetime.timedelta(days=1)
    return fecha


def _restar_habiles(fecha: datetime.date, dias: int) -> datetime.date:
    while dias > 0:
        fecha -= datetime.timedelta(days=1)
        if es_habil(fecha):
            dias -= 1
    return fecha


def _en_mes(anio: int, mes: int, dia: int) -> datetime.date:
    return datetime.date(anio, mes, min(dia, calendar.monthrange(anio, mes)[1]))


def _avanzar(frecuencia: str, intervalo: int, dia: int, nominal: datetime.date) -> datetime.date:
    if frecuencia == Frecuencia.SEMANAL:
        return nominal + datetime.timedelta(weeks=intervalo)
    total = nominal.year * 12 + nominal.month - 1 + intervalo
    return _en_mes(total // 12, total % 12 + 1, dia)


def vence(nominal: datetime.date) -> datetime.date:
    """La fecha en que vence la tarjeta de esa fecha de la serie."""
    return _anterior_habil(nominal)


def se_crea(regla: Recurrencia) -> datetime.date:
    return _restar_habiles(vence(regla.proxima), regla.anticipacion)


def primera(frecuencia: str, intervalo: int, dia: int, despues_de: datetime.date) -> datetime.date:
    """Primera fecha (sin ajustar) cuyo vencimiento cae después de `despues_de`."""
    if frecuencia == Frecuencia.SEMANAL:
        nominal = despues_de + datetime.timedelta(days=(dia - despues_de.weekday()) % 7 or 7)
    else:
        nominal = _en_mes(despues_de.year, despues_de.month, dia)
    while vence(nominal) <= despues_de:
        nominal = _avanzar(frecuencia, 1, dia, nominal)  # la primera: el siguiente día que toca
    return nominal


def periodo(frecuencia: str, nominal: datetime.date) -> str:
    """Lo que se agrega al título: «noviembre 2026» o «semana del 09/11»."""
    if frecuencia == Frecuencia.SEMANAL:
        lunes = nominal - datetime.timedelta(days=nominal.weekday())
        return f"semana del {lunes:%d/%m}"
    return f"{MESES[nominal.month - 1]} {nominal.year}"


def describir(regla: Recurrencia) -> str:
    """«Cada mes, el día 5» · «Cada 2 semanas, el lunes»."""
    if regla.frecuencia == Frecuencia.SEMANAL:
        cada = "Cada semana" if regla.intervalo == 1 else f"Cada {regla.intervalo} semanas"
        return f"{cada}, el {DIAS[regla.dia]}"
    cada = "Cada mes" if regla.intervalo == 1 else f"Cada {regla.intervalo} meses"
    dia = "el último día" if regla.dia >= 31 else f"el día {regla.dia}"
    return f"{cada}, {dia}"


# --- Validación y modelo -----------------------------------------------------------------


def _validar(frecuencia: str, intervalo: int, dia: int, anticipacion: int) -> None:
    if frecuencia not in Frecuencia.values:
        raise ReglaDeNegocio("La frecuencia es semanal o mensual.")
    if not 1 <= intervalo <= MAX_INTERVALO:
        raise ReglaDeNegocio(f"Se repite cada 1 a {MAX_INTERVALO} semanas o meses.")
    if frecuencia == Frecuencia.SEMANAL and not 0 <= dia <= 6:
        raise ReglaDeNegocio("Elige un día de la semana.")
    if frecuencia == Frecuencia.MENSUAL and not 1 <= dia <= 31:
        raise ReglaDeNegocio("Elige un día del mes (del 1 al 31).")
    if not 0 <= anticipacion <= MAX_ANTICIPACION:
        raise ReglaDeNegocio(f"Se crea de 0 a {MAX_ANTICIPACION} días hábiles antes de vencer.")


def _titulo_base(card: Card) -> str:
    """El título sin el periodo, si la tarjeta ya es de la serie."""
    regla = card.recurrencia
    if regla is not None and card.ocurrencia is not None:
        for nominal in (card.ocurrencia, regla.proxima):
            sufijo = f" · {periodo(regla.frecuencia, nominal)}"
            if card.titulo.endswith(sufijo):
                return card.titulo[: -len(sufijo)]
    return card.titulo


def _foto(card: Card) -> dict:
    return {
        "titulo": _titulo_base(card),
        "descripcion": card.descripcion,
        "columna": card.columna_id,
        "urgencia": card.urgencia,
        "en_gantt": card.en_gantt,
        "responsables": [a.usuario_id for a in card.asignaciones.all()],
        "etiquetas": [e.pk for e in card.etiquetas.all()],
        "campos": dict(card.campos or {}),
        "checklist": [i.texto for i in card.checklist.all()],
    }


# --- Operaciones -----------------------------------------------------------------------


@transaction.atomic
def crear_recurrencia(
    card: Card, *, frecuencia: str, intervalo: int, dia: int, anticipacion: int, actor
) -> Recurrencia:
    """La tarjeta pasa a ser la primera de la serie; la siguiente vence
    después de su fecha final (o de hoy, si no tiene o ya pasó)."""
    _validar(frecuencia, intervalo, dia, anticipacion)
    if card.archivada:
        raise ReglaDeNegocio("Una tarjeta archivada no se puede repetir.")
    if card.recurrencia_id:
        raise ReglaDeNegocio("Esta tarjeta ya se repite: cambia su repetición en lugar de crear otra.")
    hoy = timezone.localdate()
    base = max(hoy, card.fecha_fin) if card.fecha_fin else hoy
    regla = Recurrencia.objects.create(
        tablero=card.tablero,
        modelo=_foto(card),
        frecuencia=frecuencia,
        intervalo=intervalo,
        dia=dia,
        anticipacion=anticipacion,
        proxima=primera(frecuencia, intervalo, dia, base),
        creada_por=actor,
    )
    Card.objects.filter(pk=card.pk).update(recurrencia=regla, ocurrencia=card.fecha_fin)
    return regla


@transaction.atomic
def editar_recurrencia(regla: Recurrencia, *, modelo_desde: Card | None = None, **cambios) -> Recurrencia:
    """`cambios`: frecuencia, intervalo, dia, anticipacion, activa.
    `modelo_desde`: una tarjeta de la serie cuyo contenido pasa a ser el
    modelo de las siguientes. Si cambia el calendario, la próxima se vuelve a
    calcular desde la última tarjeta creada (o desde hoy)."""
    calendario = {c: cambios[c] for c in ("frecuencia", "intervalo", "dia") if c in cambios}
    nuevos = {
        "frecuencia": calendario.get("frecuencia", regla.frecuencia),
        "intervalo": calendario.get("intervalo", regla.intervalo),
        "dia": calendario.get("dia", regla.dia),
        "anticipacion": cambios.get("anticipacion", regla.anticipacion),
    }
    _validar(**nuevos)
    cambia_calendario = any(getattr(regla, c) != v for c, v in calendario.items())
    for campo, valor in nuevos.items():
        setattr(regla, campo, valor)
    if "activa" in cambios:
        regla.activa = bool(cambios["activa"])
    if modelo_desde is not None:
        if modelo_desde.recurrencia_id != regla.pk:
            raise ReglaDeNegocio("Esa tarjeta no es de esta serie.")
        regla.modelo = _foto(modelo_desde)
    if cambia_calendario:
        hoy = timezone.localdate()
        ultima = regla.cards.exclude(ocurrencia=None).order_by("-ocurrencia").values_list("ocurrencia", flat=True).first()
        regla.proxima = primera(regla.frecuencia, regla.intervalo, regla.dia, max(hoy, ultima or hoy))
    regla.save()
    return regla


def eliminar_recurrencia(regla: Recurrencia) -> None:
    """Deja de repetirse; las tarjetas ya creadas quedan (sin serie)."""
    regla.delete()


def _crear_tarjeta(regla: Recurrencia, nominal: datetime.date) -> Card | None:
    tablero: Tablero = regla.tablero
    m = regla.modelo
    columnas = list(tablero.columnas.activas())
    abiertas = [c for c in columnas if not c.es_final]
    columna = next((c for c in abiertas if c.pk == m.get("columna")), None) or (abiertas or columnas or [None])[0]
    if columna is None:
        return None
    personas = {u.pk: u for u in tablero.personas_asignables()}
    responsables = [personas[i] for i in m.get("responsables", []) if i in personas]
    etiquetas = list(tablero.etiquetas.filter(pk__in=m.get("etiquetas", [])))
    activos = {str(c.pk): c for c in tablero.campos.filter(archivado=False)}
    valores = {}
    for clave, valor in (m.get("campos") or {}).items():
        campo = activos.get(clave)
        if campo is None:
            continue
        try:
            normalizado = servicio_campos.valor_valido(campo, valor)
        except ReglaDeNegocio:
            continue  # la opción ya no existe: la tarjeta sale sin ese valor
        if normalizado is not None:
            valores[clave] = normalizado
    fecha_fin = vence(nominal)
    card = tarjetas.crear_card(
        tablero=tablero,
        columna=columna,
        titulo=f"{m.get('titulo', 'Tarjeta recurrente')} · {periodo(regla.frecuencia, nominal)}"[:200],
        actor=regla.creada_por,
        responsables=responsables,
        etiquetas=etiquetas,
        valores_campos=valores,
        avisar=False,
        descripcion=m.get("descripcion", ""),
        urgencia=m.get("urgencia", "media"),
        en_gantt=m.get("en_gantt", "heredar"),
        fecha_inicio=min(se_crea(regla), fecha_fin),
        fecha_fin=fecha_fin,
    )
    Card.objects.filter(pk=card.pk).update(recurrencia=regla, ocurrencia=fecha_fin)
    for texto in m.get("checklist", [])[: servicio_checklist.MAX_ITEMS]:
        servicio_checklist.agregar_item(card, texto=texto, actor=regla.creada_por)
    avisos.avisar_recurrente(card, responsables)
    return card


def generar(hoy: datetime.date | None = None) -> dict:
    """Crea las tarjetas cuya fecha de creación ya llegó. Idempotente."""
    hoy = hoy or timezone.localdate()
    resumen = {"series": 0, "creadas": 0}
    pendientes = Recurrencia.objects.filter(
        activa=True, tablero__archivado=False
    ).exclude(tablero__equipo__archivado=True).values_list("pk", flat=True)
    for pk in pendientes:
        resumen["series"] += 1
        for _ in range(MAX_POR_CORRIDA):
            with transaction.atomic():
                regla = Recurrencia.objects.select_for_update().select_related("tablero__equipo").get(pk=pk)
                if se_crea(regla) > hoy:
                    break
                if not Card.objects.filter(recurrencia=regla, ocurrencia=vence(regla.proxima)).exists():
                    if _crear_tarjeta(regla, regla.proxima) is not None:
                        resumen["creadas"] += 1
                regla.proxima = _avanzar(regla.frecuencia, regla.intervalo, regla.dia, regla.proxima)
                regla.save(update_fields=["proxima"])
    return resumen
