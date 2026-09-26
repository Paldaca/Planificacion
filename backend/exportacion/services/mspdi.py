"""
MS Project: XML de Project (MSPDI), el formato abierto que Project abre y
guarda de forma nativa (el `.mpp` es cerrado y no se genera).

Mapeo al exportar:
- Proyecto (tarea 0) = el tablero; tareas resumen = columnas (nivel 1);
  tareas = tarjetas incluidas en el Gantt con inicio y fin (nivel 2).
- Tareas **programadas manualmente**: Project respeta las fechas tal cual en
  lugar de recalcularlas; los vínculos se ven y se pueden activar después.
- Calendario «Planificación»: lunes a viernes, 8:00–12:00 y 13:00–17:00, con
  los feriados del rango como excepciones (duración = días hábiles).
- Dependencias → vínculos (FC=1, CC=3, FF=0) con desfase en días.
- Responsables → recursos y asignaciones. Avance = checklist (100 % si está
  terminada). Descripción → notas.

Al importar se hace el camino inverso (ver `leer`).
"""

from __future__ import annotations

import datetime
import re
import xml.etree.ElementTree as ET

from calendario.services.dias_habiles import duracion_habil, feriados_entre
from gantt.models import TipoDependencia
from integracion_portal.services.personas import nombre as nombre_persona

from .datos import Contenido
from .modelo import FilaEntrada

NS = "http://schemas.microsoft.com/project"
MINUTOS_DIA = 480
#: Unidad de LinkLag: décimas de minuto.
DECIMAS_POR_DIA = MINUTOS_DIA * 10
TIPO_A_PROJECT = {TipoDependencia.FIN_FIN: 0, TipoDependencia.FIN_INICIO: 1, TipoDependencia.INICIO_INICIO: 3}
PROJECT_A_TIPO = {v: k for k, v in TIPO_A_PROJECT.items()}
FIN_COMIENZO_INVERSO = 2  # «comienzo → fin»: no existe en Planificación
#: Urgencia ↔ prioridad de Project (0–1000; 500 = media).
PRIORIDAD = {"baja": 300, "media": 500, "alta": 700, "critica": 900}


def urgencia_de_prioridad(prioridad: int) -> str:
    if prioridad >= 850:
        return "critica"
    if prioridad >= 650:
        return "alta"
    if prioridad <= 350:
        return "baja"
    return "media"


#: Caracteres que XML 1.0 no admite (un título pegado desde otro programa
#: puede traerlos y Project rechazaría el archivo entero).
_NO_XML = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
#: Un MSPDI nunca trae DTD ni entidades: se rechazan (sin ellas no hay
#: expansión de entidades ni referencias externas).
_DTD = re.compile(rb"<!(DOCTYPE|ENTITY)", re.IGNORECASE)


def _sub(padre, etiqueta: str, texto=None):
    nodo = ET.SubElement(padre, etiqueta)
    if texto is not None:
        nodo.text = _NO_XML.sub("", str(texto))
    return nodo


def _inicio(fecha: datetime.date) -> str:
    return f"{fecha.isoformat()}T08:00:00"


def _fin(fecha: datetime.date) -> str:
    return f"{fecha.isoformat()}T17:00:00"


def _duracion(dias: int) -> str:
    return f"PT{dias * 8}H0M0S"


def exportar(c: Contenido) -> bytes:
    tareas_cards = [card for card in c.cards if card.entra_en_gantt and card.fecha_inicio and card.fecha_fin]
    desde = min((card.fecha_inicio for card in tareas_cards), default=c.hoy)
    hasta = max((card.fecha_fin for card in tareas_cards), default=c.hoy)

    proyecto = ET.Element("Project", xmlns=NS)
    for etiqueta, valor in [
        ("SaveVersion", 14),
        ("Name", f"{c.tablero.nombre}.xml"),
        ("Title", c.tablero.nombre),
        ("Author", "Planificación · Paldaca"),
        ("ScheduleFromStart", 1),
        ("StartDate", _inicio(desde)),
        ("FinishDate", _fin(hasta)),
        ("CalendarUID", 1),
        ("DefaultStartTime", "08:00:00"),
        ("DefaultFinishTime", "17:00:00"),
        ("MinutesPerDay", MINUTOS_DIA),
        ("MinutesPerWeek", MINUTOS_DIA * 5),
        ("DaysPerMonth", 20),
        ("DurationFormat", 7),
        ("WeekStartDay", 1),
    ]:
        _sub(proyecto, etiqueta, valor)

    _calendario(_sub(proyecto, "Calendars"), desde, hasta)

    tareas = _sub(proyecto, "Tasks")
    _tarea_resumen(tareas, uid=0, nombre=c.tablero.nombre, nivel=0, esquema="0", desde=desde, hasta=hasta)
    uid_de_card: dict[int, int] = {}
    uid = 1
    columnas = []
    for card in tareas_cards:
        if card.columna not in columnas:
            columnas.append(card.columna)
    predecesoras: dict[int, list] = {}
    for d in c.dependencias:
        predecesoras.setdefault(d.sucesora_id, []).append(d)

    # Primero los UID (un vínculo puede apuntar a una tarjeta de más abajo);
    # luego las tareas EN ORDEN: cada resumen seguido de sus tarjetas, que es
    # lo que MS Project usa para armar la jerarquía.
    grupos = []
    for columna in columnas:
        hijas = [card for card in tareas_cards if card.columna_id == columna.pk]
        uid_resumen = uid
        uid += 1
        for card in hijas:
            uid_de_card[card.pk] = uid
            uid += 1
        grupos.append((columna, uid_resumen, hijas))

    recursos: dict[int, tuple[int, object]] = {}
    asignaciones = []
    for i, (columna, uid_resumen, hijas) in enumerate(grupos, start=1):
        _tarea_resumen(
            tareas,
            uid=uid_resumen,
            nombre=columna.nombre,
            nivel=1,
            esquema=str(i),
            desde=min(h.fecha_inicio for h in hijas),
            hasta=max(h.fecha_fin for h in hijas),
        )
        for j, card in enumerate(hijas, start=1):
            _tarea_card(tareas, card, uid_de_card, predecesoras.get(card.pk, []), f"{i}.{j}", c)
            for a in card.asignaciones.all():
                if a.usuario_id not in recursos:
                    recursos[a.usuario_id] = (len(recursos) + 1, a.usuario)
                asignaciones.append((uid_de_card[card.pk], recursos[a.usuario_id][0]))

    nodo_recursos = _sub(proyecto, "Resources")
    for ruid, usuario in recursos.values():
        r = _sub(nodo_recursos, "Resource")
        _sub(r, "UID", ruid)
        _sub(r, "ID", ruid)
        _sub(r, "Name", nombre_persona(usuario))
        _sub(r, "Type", 1)
        _sub(r, "IsNull", 0)
        if usuario.email:
            _sub(r, "EmailAddress", usuario.email)
        _sub(r, "CalendarUID", 1)
    nodo_asig = _sub(proyecto, "Assignments")
    for k, (tuid, ruid) in enumerate(asignaciones, start=1):
        a = _sub(nodo_asig, "Assignment")
        _sub(a, "UID", k)
        _sub(a, "TaskUID", tuid)
        _sub(a, "ResourceUID", ruid)
        _sub(a, "Units", 1)

    ET.indent(proyecto)
    return ET.tostring(proyecto, encoding="UTF-8", xml_declaration=True)


def _calendario(calendarios, desde: datetime.date, hasta: datetime.date) -> None:
    cal = _sub(calendarios, "Calendar")
    _sub(cal, "UID", 1)
    _sub(cal, "Name", "Planificación")
    _sub(cal, "IsBaseCalendar", 1)
    _sub(cal, "BaseCalendarUID", -1)
    semana = _sub(cal, "WeekDays")
    for tipo in range(1, 8):  # 1 = domingo … 7 = sábado
        dia = _sub(semana, "WeekDay")
        _sub(dia, "DayType", tipo)
        laborable = tipo not in (1, 7)
        _sub(dia, "DayWorking", int(laborable))
        if laborable:
            horarios = _sub(dia, "WorkingTimes")
            for de, a in (("08:00:00", "12:00:00"), ("13:00:00", "17:00:00")):
                t = _sub(horarios, "WorkingTime")
                _sub(t, "FromTime", de)
                _sub(t, "ToTime", a)
    excepciones = _sub(cal, "Exceptions")
    for f in feriados_entre(desde, hasta):
        e = _sub(excepciones, "Exception")
        _sub(e, "EnteredByOccurrences", 0)
        periodo = _sub(e, "TimePeriod")
        _sub(periodo, "FromDate", f"{f['fecha'].isoformat()}T00:00:00")
        _sub(periodo, "ToDate", f"{f['fecha'].isoformat()}T23:59:00")
        _sub(e, "Occurrences", 1)
        _sub(e, "Name", f["nombre"])
        _sub(e, "Type", 1)
        _sub(e, "DayWorking", 0)


def _tarea_resumen(tareas, *, uid, nombre, nivel, esquema, desde, hasta) -> None:
    t = _sub(tareas, "Task")
    dias = duracion_habil(desde, hasta)
    # Orden del esquema MSPDI (xsd:sequence): Project es estricto con él.
    for etiqueta, valor in [
        ("UID", uid),
        ("ID", uid),
        ("Name", nombre),
        ("Active", 1),
        ("Manual", 0),
        ("Type", 1),
        ("IsNull", 0),
        ("OutlineNumber", esquema),
        ("OutlineLevel", nivel),
        ("Start", _inicio(desde)),
        ("Finish", _fin(hasta)),
        ("Duration", _duracion(dias)),
        ("DurationFormat", 7),
        ("Summary", 1),
    ]:
        _sub(t, etiqueta, valor)


def _tarea_card(tareas, card, uid_de_card, deps, esquema, c: Contenido) -> None:
    t = _sub(tareas, "Task")
    dias = duracion_habil(card.fecha_inicio, card.fecha_fin)
    items = list(card.checklist.all())
    terminada = c.vencimiento(card) == "terminada"
    avance = 100 if terminada else (round(100 * sum(i.hecho for i in items) / len(items)) if items else 0)
    uid = uid_de_card[card.pk]
    # Orden del esquema MSPDI (xsd:sequence).
    for etiqueta, valor in [
        ("UID", uid),
        ("ID", uid),
        ("Name", card.titulo),
        ("Active", 1),
        ("Manual", 1),
        ("Type", 1),
        ("IsNull", 0),
        ("OutlineNumber", esquema),
        ("OutlineLevel", 2),
        ("Priority", PRIORIDAD[card.urgencia]),
        ("Start", _inicio(card.fecha_inicio)),
        ("Finish", _fin(card.fecha_fin)),
        ("Duration", _duracion(dias)),
        ("ManualStart", _inicio(card.fecha_inicio)),
        ("ManualFinish", _fin(card.fecha_fin)),
        ("ManualDuration", _duracion(dias)),
        ("DurationFormat", 7),
        ("Milestone", 0),
        ("Summary", 0),
        ("PercentComplete", avance),
    ]:
        _sub(t, etiqueta, valor)
    if card.descripcion:
        _sub(t, "Notes", card.descripcion)
    for d in deps:
        if d.predecesora_id not in uid_de_card:
            continue
        v = _sub(t, "PredecessorLink")
        _sub(v, "PredecessorUID", uid_de_card[d.predecesora_id])
        _sub(v, "Type", TIPO_A_PROJECT[d.tipo])
        _sub(v, "CrossProject", 0)
        _sub(v, "LinkLag", d.desfase_dias * DECIMAS_POR_DIA)
        _sub(v, "LagFormat", 7)


# --- Leer (importación) -----------------------------------------------------------------


def _texto(nodo, etiqueta: str) -> str:
    hijo = nodo.find(f"{{{NS}}}{etiqueta}")
    return (hijo.text or "").strip() if hijo is not None and hijo.text else ""


def _fecha(valor: str) -> datetime.date | None:
    if not valor:
        return None
    try:
        return datetime.date.fromisoformat(valor[:10])
    except ValueError:
        return None


def leer(contenido_archivo: bytes) -> list[FilaEntrada]:
    """Tareas (no resumen) del XML. La columna sale del nombre de su tarea
    resumen; lanza ValueError si no es un XML de Project."""
    if _DTD.search(contenido_archivo):
        raise ValueError("El XML trae declaraciones DOCTYPE o ENTITY: no se admiten.")
    try:
        raiz = ET.fromstring(contenido_archivo)
    except ET.ParseError as exc:
        raise ValueError("El archivo no es un XML válido.") from exc
    if raiz.tag != f"{{{NS}}}Project":
        raise ValueError("No es un XML de MS Project (guárdalo como «XML» desde Project).")

    recursos = {
        _texto(r, "UID"): _texto(r, "Name")
        for r in raiz.iterfind(f"{{{NS}}}Resources/{{{NS}}}Resource")
        if _texto(r, "Name")
    }
    por_tarea: dict[str, list[str]] = {}
    for a in raiz.iterfind(f"{{{NS}}}Assignments/{{{NS}}}Assignment"):
        nombre = recursos.get(_texto(a, "ResourceUID"))
        if nombre:
            por_tarea.setdefault(_texto(a, "TaskUID"), []).append(nombre)

    entradas: list[FilaEntrada] = []
    resumen_por_nivel: dict[int, str] = {}
    for n, t in enumerate(raiz.iterfind(f"{{{NS}}}Tasks/{{{NS}}}Task"), start=1):
        uid = _texto(t, "UID")
        nivel = int(_texto(t, "OutlineLevel") or 1)
        if uid == "0" or _texto(t, "IsNull") == "1":
            continue
        if _texto(t, "Summary") == "1":
            resumen_por_nivel[nivel] = _texto(t, "Name")
            continue
        errores, avisos = [], []
        depende = []
        for v in t.iterfind(f"{{{NS}}}PredecessorLink"):
            tipo_project = int(_texto(v, "Type") or 1)
            if tipo_project == FIN_COMIENZO_INVERSO:
                avisos.append("Un vínculo «comienzo → fin» no existe en Planificación: se omite.")
                continue
            lag = int(float(_texto(v, "LinkLag") or 0))
            depende.append((int(_texto(v, "PredecessorUID")), PROJECT_A_TIPO[tipo_project], round(lag / DECIMAS_POR_DIA)))
        entradas.append(
            FilaEntrada(
                fila=n,
                ref=int(uid) if uid.isdigit() else None,
                titulo=_texto(t, "Name"),
                descripcion=_texto(t, "Notes"),
                columna=resumen_por_nivel.get(nivel - 1, ""),
                urgencia=urgencia_de_prioridad(int(_texto(t, "Priority") or 500)),
                inicio=_fecha(_texto(t, "ManualStart") or _texto(t, "Start")),
                fin=_fecha(_texto(t, "ManualFinish") or _texto(t, "Finish")),
                responsables=por_tarea.get(uid, []),
                depende=depende,
                completada=_texto(t, "PercentComplete") == "100",
                errores=errores,
                avisos=avisos,
            )
        )
    return entradas
