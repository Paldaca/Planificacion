"""
Gantt en PDF para compartir (ReportLab: vectorial, se ve igual en cualquier
equipo y se imprime nítido).

Sale con la configuración de la pantalla: los filtros (ya aplicados en
`Contenido`), la agrupación, los grupos plegados y la escala (el zoom del
Gantt o «ajustar al ancho»), en el periodo que se pida (todo el plan o de una
fecha a otra), en hoja Carta u 11×17 (tabloide), siempre horizontal.

Qué dibuja: cabecera con el tablero y la configuración, resumen de avance,
el diagrama (grupos con su avance y barra resumen, barras con el color de la
urgencia y el avance del checklist, hitos como rombos, flechas de dependencias, hoy, fines de
semana y feriados) y una leyenda en cada hoja.

La agrupación y el orden de las filas son un espejo de
`frontend/src/lib/gantt.ts` (`grupoDe`, `construirFilas`, `rutaFlecha`): si
cambia uno, cambiar el otro, para que el PDF muestre lo mismo que la pantalla.
"""

from __future__ import annotations

import datetime
import io
import math
from dataclasses import dataclass, field

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from calendario.services.dias_habiles import feriados_entre
from core.errores import ReglaDeNegocio
from gantt.models import TipoDependencia
from gantt.services.dependencias import incumple
from integracion_portal.services.personas import nombre as nombre_persona
from tableros.models import TipoCampo

from .datos import Contenido

# --- Opciones -----------------------------------------------------------------------------

ESCALAS = ("ajustar", "zoom")
ZOOMS = ("dia", "semana", "mes")
AGRUPACIONES = ("columna", "responsable", "urgencia", "ninguna")
#: Además de las fijas: un campo de lista del tablero por su nombre (`campo:Fase`).
PREFIJO_CAMPO = "campo:"
HOJAS = {
    "carta": ("Carta", landscape(letter)),
    "tabloide": ("11×17", landscape((11 * inch, 17 * inch))),
}
#: Puntos por día con «zoom actual» (la pantalla usa 36/16/5 px).
PT_POR_DIA = {"dia": 14.0, "semana": 5.5, "mes": 1.8}
NOMBRE_ZOOM = {"dia": "Día", "semana": "Semana", "mes": "Mes"}
NOMBRE_AGRUPAR = {"columna": "columna", "responsable": "responsable", "urgencia": "urgencia", "ninguna": "sin agrupar"}
#: Un PDF más largo que esto se pide de otra forma (escala o periodo).
MAX_PAGINAS = 150


@dataclass(frozen=True)
class OpcionesPdf:
    escala: str = "ajustar"
    zoom: str = "semana"
    agrupar: str = "columna"
    plegados: frozenset[str] = frozenset()
    desde: datetime.date | None = None
    hasta: datetime.date | None = None
    hoja: str = "carta"

    @classmethod
    def desde_query(cls, params) -> OpcionesPdf:
        def elegir(clave, validas, defecto):
            valor = params.get(clave) or defecto
            if valor not in validas:
                raise ReglaDeNegocio(f"«{clave}» no es válido: usa {', '.join(validas)}.")
            return valor

        def fecha(clave):
            valor = params.get(clave)
            if not valor:
                return None
            try:
                return datetime.date.fromisoformat(valor)
            except ValueError as exc:
                raise ReglaDeNegocio(f"«{clave}» debe ser una fecha AAAA-MM-DD.") from exc

        agrupar = params.get("agrupar") or ""
        desde, hasta = fecha("desde"), fecha("hasta")
        if (desde is None) != (hasta is None):
            raise ReglaDeNegocio("Para un periodo indica las dos fechas: desde y hasta.")
        if desde and hasta and hasta < desde:
            raise ReglaDeNegocio("La fecha «hasta» no puede ser anterior a «desde».")
        return cls(
            escala=elegir("escala", ESCALAS, "ajustar"),
            zoom=elegir("zoom", ZOOMS, "semana"),
            agrupar=agrupar if agrupar.startswith(PREFIJO_CAMPO) else elegir("agrupar", AGRUPACIONES, "columna"),
            plegados=frozenset(params.getlist("plegado")),
            desde=desde,
            hasta=hasta,
            hoja=elegir("hoja", tuple(HOJAS), "carta"),
        )


# --- Colores (los de la interfaz: lib/estilos.ts e index.css) ---------------------------

MARINO = HexColor("#141644")
MORADO = HexColor("#32407b")
TEXTO = HexColor("#2a2f52")
TENUE = HexColor("#5a6294")
LINEA = HexColor("#e3e6f2")
FONDO = HexColor("#f5f6fb")
VERDE = "#059669"
ROJO = "#dc2626"
AMBAR = "#d97706"
URGENCIAS = {
    "baja": ("Baja", "#64748b"),
    "media": ("Media", "#2563eb"),
    "alta": ("Alta", "#d97706"),
    "critica": ("Crítica", "#ed2546"),
}
ORDEN_URGENCIA = ["baja", "media", "alta", "critica"]
COLORES_AVATAR = ["#32407b", "#2563eb", "#0d9488", "#7c3aed", "#b45309", "#be123c", "#0369a1", "#4f46e5"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
INICIALES_DIA = ["L", "M", "M", "J", "V", "S", "D"]


def mezcla(color: str, porcentaje: float) -> HexColor:
    """`color-mix(color porcentaje%, #fff)`, como en la pantalla."""
    c = HexColor(color)
    p = porcentaje / 100
    return HexColor(
        "#%02x%02x%02x"
        % tuple(round(255 * (v * p + (1 - p))) for v in (c.red, c.green, c.blue))
    )


# --- Medidas (puntos) -------------------------------------------------------------------

MARGEN = 26
ALTO_FILA = 16
ALTO_GRUPO = 16
ALTO_BARRA = 10
ALTO_ESCALA = 26
ALTO_CABECERA_PRIMERA = 92
ALTO_CABECERA = 30
ALTO_PIE = 34
ANCHO_ETIQUETAS = {"carta": 190, "tabloide": 250}
FUENTE = "Helvetica"
FUENTE_NEGRITA = "Helvetica-Bold"


# --- Filas (espejo de construirFilas en lib/gantt.ts) -----------------------------------


@dataclass
class Fila:
    tipo: str  # "grupo" | "card"
    card: object | None = None
    clave: str = ""
    titulo: str = ""
    color: str = "#32407b"
    total: int = 0
    hechas: int = 0
    vencidas: int = 0
    desde: datetime.date | None = None
    hasta: datetime.date | None = None

    @property
    def alto(self) -> int:
        return ALTO_GRUPO if self.tipo == "grupo" else ALTO_FILA


def campo_de_agrupacion(agrupar: str, c: Contenido):
    """El campo de lista activo de `campo:<nombre>`; None si se agrupa por algo fijo."""
    if not agrupar.startswith(PREFIJO_CAMPO):
        return None
    nombre = agrupar[len(PREFIJO_CAMPO) :]
    campo = next((k for k in c.campos if k.tipo == TipoCampo.LISTA and k.nombre == nombre), None)
    if campo is None:
        raise ReglaDeNegocio(f"Este tablero no tiene un campo de lista «{nombre}» para agrupar.")
    return campo


def nombre_agrupacion(agrupar: str) -> str:
    return agrupar[len(PREFIJO_CAMPO) :] if agrupar.startswith(PREFIJO_CAMPO) else NOMBRE_AGRUPAR[agrupar]


def _grupo_de_campo(card, campo) -> tuple[str, str, str, float]:
    """Un grupo por opción, en el orden de la lista; al final, las tarjetas sin valor."""
    valor = (card.campos or {}).get(str(campo.pk))
    if valor in (None, ""):
        return "f:", f"Sin {campo.nombre.lower()}", "#94a3b8", len(campo.opciones) + 1
    texto = str(valor)
    orden = campo.opciones.index(texto) if texto in campo.opciones else len(campo.opciones)
    return f"f:{texto}", texto, COLORES_AVATAR[orden % len(COLORES_AVATAR)], orden


def _grupo(card, agrupar: str, campo=None) -> tuple[str, str, str, float]:
    """(clave, título, color, orden) del grupo de una tarjeta."""
    if campo is not None:
        return _grupo_de_campo(card, campo)
    if agrupar == "columna":
        col = card.columna
        return f"c{col.pk}", col.nombre, VERDE if col.es_final else "#32407b", col.orden
    if agrupar == "responsable":
        asignaciones = list(card.asignaciones.all())
        if not asignaciones:
            return "p0", "Sin responsable", "#94a3b8", 1
        usuario = asignaciones[0].usuario
        return f"p{usuario.pk}", nombre_persona(usuario), COLORES_AVATAR[usuario.pk % len(COLORES_AVATAR)], 0
    etiqueta, color = URGENCIAS[card.urgencia]
    return card.urgencia, etiqueta, color, -ORDEN_URGENCIA.index(card.urgencia)


def _por_inicio(card):
    return (card.fecha_inicio, card.numero)


def construir_filas(cards: list, opciones: OpcionesPdf, c: Contenido) -> list[Fila]:
    if opciones.agrupar == "ninguna":
        return [Fila("card", card=card) for card in sorted(cards, key=_por_inicio)]
    campo = campo_de_agrupacion(opciones.agrupar, c)
    grupos: dict[str, dict] = {}
    for card in cards:
        clave, titulo, color, orden = _grupo(card, opciones.agrupar, campo)
        grupos.setdefault(clave, {"titulo": titulo, "color": color, "orden": orden, "cards": []})["cards"].append(card)
    filas: list[Fila] = []
    for clave, g in sorted(grupos.items(), key=lambda kv: (kv[1]["orden"], kv[1]["titulo"].lower())):
        estados = [c.vencimiento(card) for card in g["cards"]]
        filas.append(
            Fila(
                "grupo",
                clave=clave,
                titulo=g["titulo"],
                color=g["color"],
                total=len(g["cards"]),
                hechas=estados.count("terminada"),
                vencidas=estados.count("vencida"),
                desde=min(card.fecha_inicio for card in g["cards"]),
                hasta=max(card.fecha_fin for card in g["cards"]),
            )
        )
        if clave not in opciones.plegados:
            filas.extend(Fila("card", card=card) for card in sorted(g["cards"], key=_por_inicio))
    return filas


# --- Texto ------------------------------------------------------------------------------


def _seguro(texto: str) -> str:
    """Las fuentes base del PDF solo tienen Windows-1252: lo demás sale como «?»."""
    return str(texto).encode("cp1252", "replace").decode("cp1252")


def _recortar(texto: str, fuente: str, tamano: float, ancho: float) -> str:
    texto = _seguro(texto)
    if stringWidth(texto, fuente, tamano) <= ancho:
        return texto
    while texto and stringWidth(texto + "…", fuente, tamano) > ancho:
        texto = texto[:-1]
    return texto.rstrip() + "…" if texto else ""


def _fecha_corta(fecha: datetime.date) -> str:
    return f"{fecha.day} {MESES_CORTOS[fecha.month - 1]} {fecha.year}"


# --- Páginas ----------------------------------------------------------------------------


@dataclass
class Pagina:
    filas: list[Fila]
    desde: datetime.date
    hasta: datetime.date
    primera: bool
    tramo: int = 1
    tramos: int = 1


@dataclass
class Plan:
    """Todo lo que hace falta para dibujar, calculado antes (para «página x de y»)."""

    c: Contenido
    opciones: OpcionesPdf
    ancho: float
    alto: float
    ancho_etiquetas: float
    pt_dia: float
    desde: datetime.date
    hasta: datetime.date
    filas: list[Fila]
    incluidas: list
    con_fechas: list
    paginas: list[Pagina] = field(default_factory=list)
    feriados: dict = field(default_factory=dict)

    @property
    def ancho_tiempo(self) -> float:
        return self.ancho - 2 * MARGEN - self.ancho_etiquetas


def _dias(desde: datetime.date, hasta: datetime.date) -> int:
    return (hasta - desde).days + 1


def planificar(c: Contenido, opciones: OpcionesPdf) -> Plan:
    ancho, alto = HOJAS[opciones.hoja][1]
    incluidas = [card for card in c.cards if card.entra_en_gantt]
    con_fechas = [card for card in incluidas if card.fecha_inicio and card.fecha_fin]

    if opciones.desde and opciones.hasta:
        desde, hasta = opciones.desde, opciones.hasta
        # Solo las que tocan el periodo; las que lo cruzan se recortan al dibujar.
        visibles = [card for card in con_fechas if card.fecha_fin >= desde and card.fecha_inicio <= hasta]
    else:
        visibles = con_fechas
        if visibles:
            primero = min(card.fecha_inicio for card in visibles)
            desde = primero - datetime.timedelta(days=primero.weekday())  # lunes
            hasta = max(card.fecha_fin for card in visibles) + datetime.timedelta(days=3)
        else:
            desde = c.hoy - datetime.timedelta(days=c.hoy.weekday())
            hasta = desde + datetime.timedelta(days=27)

    plan = Plan(
        c=c,
        opciones=opciones,
        ancho=ancho,
        alto=alto,
        ancho_etiquetas=ANCHO_ETIQUETAS[opciones.hoja],
        pt_dia=0,
        desde=desde,
        hasta=hasta,
        filas=construir_filas(visibles, opciones, c),
        incluidas=incluidas,
        con_fechas=con_fechas,
    )
    dias = _dias(desde, hasta)
    if opciones.escala == "ajustar":
        plan.pt_dia = plan.ancho_tiempo / dias
        tramos = [(desde, hasta)]
    else:
        plan.pt_dia = PT_POR_DIA[opciones.zoom]
        por_tramo = max(1, math.floor(plan.ancho_tiempo / plan.pt_dia))
        tramos = []
        inicio = desde
        while inicio <= hasta:
            fin = min(hasta, inicio + datetime.timedelta(days=por_tramo - 1))
            tramos.append((inicio, fin))
            inicio = fin + datetime.timedelta(days=1)

    # Filas por hoja: la primera tiene menos sitio (cabecera y resumen).
    def disponible(primera: bool) -> float:
        cabecera = ALTO_CABECERA_PRIMERA if primera else ALTO_CABECERA
        return alto - MARGEN - cabecera - ALTO_ESCALA - ALTO_PIE - MARGEN

    bloques: list[list[Fila]] = []
    actual: list[Fila] = []
    usado = 0.0
    for fila in plan.filas:
        if actual and usado + fila.alto > disponible(not bloques):
            bloques.append(actual)
            actual, usado = [], 0.0
        actual.append(fila)
        usado += fila.alto
    bloques.append(actual)

    total = len(bloques) * len(tramos)
    if total > MAX_PAGINAS:
        raise ReglaDeNegocio(
            f"El PDF saldría de {total} hojas. Usa «Ajustar al ancho», la hoja 11×17 o un periodo más corto."
        )
    for t, (inicio, fin) in enumerate(tramos, start=1):
        for bloque in bloques:
            plan.paginas.append(
                Pagina(filas=bloque, desde=inicio, hasta=fin, primera=not plan.paginas, tramo=t, tramos=len(tramos))
            )
    plan.feriados = {f["fecha"]: f["nombre"] for f in feriados_entre(desde, hasta)}
    return plan


# --- Dibujo -----------------------------------------------------------------------------


def exportar(c: Contenido, opciones: OpcionesPdf | None = None) -> bytes:
    opciones = opciones or OpcionesPdf()
    plan = planificar(c, opciones)
    salida = io.BytesIO()
    lienzo = Canvas(salida, pagesize=(plan.ancho, plan.alto), pageCompression=1)
    lienzo.setTitle(_seguro(f"Gantt · {c.tablero.nombre}"))
    lienzo.setAuthor("Planificación · Paldaca")
    lienzo.setSubject("Diagrama de Gantt")
    for numero, pagina in enumerate(plan.paginas, start=1):
        _Hoja(lienzo, plan, pagina, numero).dibujar()
        lienzo.showPage()
    lienzo.save()
    return salida.getvalue()


class _Hoja:
    def __init__(self, lienzo: Canvas, plan: Plan, pagina: Pagina, numero: int):
        self.l = lienzo
        self.plan = plan
        self.p = pagina
        self.numero = numero
        self.x_tiempo = MARGEN + plan.ancho_etiquetas
        self.y_diagrama = MARGEN + (ALTO_CABECERA_PRIMERA if pagina.primera else ALTO_CABECERA)
        self.y_filas = self.y_diagrama + ALTO_ESCALA
        self.dias = _dias(pagina.desde, pagina.hasta)
        self.ancho_tiempo = self.dias * plan.pt_dia
        self.alto_filas = sum(f.alto for f in pagina.filas)

    # Coordenadas: se piensa desde arriba (como la pantalla); ReportLab mide desde abajo.
    def Y(self, y: float) -> float:
        return self.plan.alto - y

    def x(self, fecha: datetime.date) -> float:
        return self.x_tiempo + (fecha - self.p.desde).days * self.plan.pt_dia

    def texto(self, x, y, texto, tamano=7, color=TEXTO, negrita=False, derecha=False, centrado=False):
        self.l.setFillColor(color)
        self.l.setFont(FUENTE_NEGRITA if negrita else FUENTE, tamano)
        dibujar = self.l.drawRightString if derecha else self.l.drawCentredString if centrado else self.l.drawString
        dibujar(x, self.Y(y), _seguro(texto))

    def rect(self, x, y, ancho, alto, relleno=None, borde=None, grosor=0.5, radio=0):
        if relleno is not None:
            self.l.setFillColor(relleno)
        if borde is not None:
            self.l.setStrokeColor(borde)
            self.l.setLineWidth(grosor)
        args = (x, self.Y(y + alto), ancho, alto)
        kwargs = {"fill": int(relleno is not None), "stroke": int(borde is not None)}
        if radio:
            self.l.roundRect(*args, radio, **kwargs)
        else:
            self.l.rect(*args, **kwargs)

    def dibujar(self) -> None:
        self.cabecera()
        self.escala()
        self.fondo()
        if not self.p.filas:
            self.texto(
                self.x_tiempo + 12,
                self.y_filas + 24,
                "No hay tareas con fechas en el Gantt para estos filtros o este periodo.",
                tamano=9,
                color=TENUE,
            )
        # Las flechas van debajo de barras y títulos (si no, tachan el texto).
        self.cajas = self.calcular_cajas()
        self.flechas()
        self.filas()
        self.hoy()
        self.pie()

    # --- Cabecera y resumen ---
    def cabecera(self) -> None:
        plan, c = self.plan, self.plan.c
        tablero = c.tablero
        self.texto(MARGEN, MARGEN + 14, tablero.nombre, tamano=15, color=MARINO, negrita=True)
        emitido = f"Emitido el {_fecha_corta(c.hoy)}"
        self.texto(plan.ancho - MARGEN, MARGEN + 12, emitido, tamano=7.5, color=TENUE, derecha=True)
        if not self.p.primera:
            detalle = f"Diagrama de Gantt (continuación) · {_fecha_corta(self.p.desde)} – {_fecha_corta(self.p.hasta)}"
            self.texto(MARGEN, MARGEN + 25, detalle, tamano=7.5, color=TENUE)
            return
        o = plan.opciones
        equipo = f"Equipo {tablero.equipo.nombre}" if tablero.equipo_id else "Tablero personal"
        escala = "ajustada al ancho" if o.escala == "ajustar" else f"zoom {NOMBRE_ZOOM[o.zoom]}"
        periodo = f"{_fecha_corta(plan.desde)} – {_fecha_corta(plan.hasta)}"
        linea = f"{equipo} · Diagrama de Gantt · {periodo} · Escala {escala} · Agrupado por {nombre_agrupacion(o.agrupar)}"
        self.texto(MARGEN, MARGEN + 27, _recortar(linea, FUENTE, 8, plan.ancho - 2 * MARGEN), tamano=8, color=TENUE)
        filtros = f"Filtros: {c.filtros}" if c.filtros else "Sin filtros: todas las tarjetas del Gantt."
        if self.p.tramos > 1:
            filtros += f" · El periodo se reparte en {self.p.tramos} tramos de hojas."
        self.texto(MARGEN, MARGEN + 38, _recortar(filtros, FUENTE, 7, plan.ancho - 2 * MARGEN), tamano=7, color=TENUE)
        self.resumen(MARGEN + 48)

    def resumen(self, y: float) -> None:
        plan, c = self.plan, self.plan.c
        estados = [c.vencimiento(card) for card in plan.incluidas]
        total = len(plan.incluidas)
        hechas = estados.count("terminada")
        pct = round(100 * hechas / total) if total else 0
        self.rect(MARGEN, y, plan.ancho - 2 * MARGEN, 30, relleno=FONDO, radio=5)
        self.texto(MARGEN + 10, y + 19, f"{pct} % terminado", tamano=11, color=MARINO, negrita=True)
        barra_x = MARGEN + 105
        self.rect(barra_x, y + 12, 150, 6, relleno=LINEA, radio=3)
        if pct:
            self.rect(barra_x, y + 12, 150 * pct / 100, 6, relleno=HexColor(VERDE), radio=3)
        x = barra_x + 162
        self.texto(x, y + 19, f"{hechas} de {total} tareas", tamano=8, color=TENUE)
        x += 90
        datos = [
            (estados.count("vencida"), "vencidas", ROJO),
            (estados.count("vence_pronto"), "vencen pronto", AMBAR),
            (total - len(plan.con_fechas), "sin fechas", "#5a6294"),
            (len(plan.c.dependencias), "dependencias", "#5a6294"),
        ]
        for n, etiqueta, color in datos:
            self.l.setFillColor(HexColor(color))
            self.l.circle(x + 3, self.Y(y + 16.5), 2.6, stroke=0, fill=1)
            texto = f"{n} {etiqueta}"
            self.texto(x + 9, y + 19, texto, tamano=8, color=HexColor(color), negrita=etiqueta != "dependencias")
            x += 18 + stringWidth(texto, FUENTE_NEGRITA, 8)

    # --- Escala de fechas ---
    def escala(self) -> None:
        pt = self.plan.pt_dia
        y = self.y_diagrama
        self.rect(MARGEN, y, self.plan.ancho_etiquetas + self.ancho_tiempo, ALTO_ESCALA, relleno=FONDO)
        etiqueta = "TAREA" if self.plan.opciones.agrupar == "ninguna" else "GRUPO / TAREA"
        self.texto(MARGEN + 6, y + ALTO_ESCALA - 7, etiqueta, tamano=6.5, color=TENUE, negrita=True)

        # Fila de arriba: meses (o años si no caben los meses).
        dia = self.p.desde
        while dia <= self.p.hasta:
            fin_mes = (dia.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - datetime.timedelta(days=1)
            fin = min(fin_mes, self.p.hasta)
            x1, x2 = self.x(dia), self.x(fin) + pt
            nombre = f"{MESES[dia.month - 1]} {dia.year}" if x2 - x1 > 70 else MESES_CORTOS[dia.month - 1]
            if x2 - x1 > 14:
                self.texto(x1 + 3, y + 10, _recortar(nombre, FUENTE_NEGRITA, 7, x2 - x1 - 5), tamano=7, color=MARINO, negrita=True)
            self.linea(x1, y, x1, y + ALTO_ESCALA, LINEA)
            dia = fin + datetime.timedelta(days=1)

        # Fila de abajo: días, lunes de cada semana o nada (según el espacio).
        dia = self.p.desde
        while dia <= self.p.hasta:
            x1 = self.x(dia)
            if x1 + max(pt, 9) > self.x_tiempo + self.ancho_tiempo + 0.5:
                break  # el número no cabe al final de la escala
            if pt >= 11:
                color = TENUE if dia.weekday() < 5 else HexColor("#a3a9c9")
                self.texto(x1 + pt / 2, y + 21, str(dia.day), tamano=5.5, color=color, centrado=True)
            elif pt >= 2.6 and dia.weekday() == 0:
                self.texto(x1 + 1.5, y + 21, str(dia.day), tamano=5.5, color=TENUE)
                self.linea(x1, y + 14, x1, y + ALTO_ESCALA, LINEA)
            dia += datetime.timedelta(days=1)
        self.linea(MARGEN, y + ALTO_ESCALA, self.x_tiempo + self.ancho_tiempo, y + ALTO_ESCALA, LINEA)

    def linea(self, x1, y1, x2, y2, color, grosor=0.5, discontinua=None):
        self.l.setStrokeColor(color)
        self.l.setLineWidth(grosor)
        self.l.setDash(*(discontinua or ([], 0)))
        self.l.line(x1, self.Y(y1), x2, self.Y(y2))
        self.l.setDash([], 0)

    # --- Fondo del área de tiempo: fines de semana, feriados, meses ---
    def fondo(self) -> None:
        pt, y, alto = self.plan.pt_dia, self.y_filas, self.alto_filas
        if not alto:
            return
        dia = self.p.desde
        while dia <= self.p.hasta:
            x1 = self.x(dia)
            if dia in self.plan.feriados:
                self.rect(x1, y, max(pt, 0.8), alto, relleno=mezcla(ROJO, 9))
            elif dia.weekday() >= 5 and pt >= 1.5:
                self.rect(x1, y, pt, alto, relleno=HexColor("#f1f2f8"))
            if dia.day == 1:
                self.linea(x1, y, x1, y + alto, LINEA)
            dia += datetime.timedelta(days=1)

    def calcular_cajas(self) -> dict[int, tuple[float, float, float]]:
        """Borde izquierdo, derecho y centro vertical de cada barra de esta hoja."""
        cajas, y = {}, self.y_filas
        for fila in self.p.filas:
            if fila.tipo == "card":
                card = fila.card
                cajas[card.pk] = (self.x(card.fecha_inicio), self.x(card.fecha_fin) + self.plan.pt_dia, y + fila.alto / 2)
            y += fila.alto
        return cajas

    # --- Filas: etiquetas a la izquierda y barras ---
    def filas(self) -> None:
        y = self.y_filas
        ancho_texto = self.plan.ancho_etiquetas - 16
        for fila in self.p.filas:
            if fila.tipo == "grupo":
                self.rect(MARGEN, y, self.plan.ancho_etiquetas + self.ancho_tiempo, fila.alto, relleno=mezcla("#f5f6fb", 90))
                self.l.setFillColor(HexColor(fila.color))
                self.l.circle(MARGEN + 7, self.Y(y + fila.alto / 2), 2.6, stroke=0, fill=1)
                cuenta = f"{fila.hechas}/{fila.total}"
                if fila.vencidas:
                    cuenta = f"{fila.vencidas} venc. · {cuenta}"
                ancho_cuenta = stringWidth(cuenta, FUENTE, 6.5) + 6
                self.texto(
                    MARGEN + 14,
                    y + fila.alto / 2 + 2.5,
                    _recortar(fila.titulo, FUENTE_NEGRITA, 7.5, ancho_texto - ancho_cuenta - 4),
                    tamano=7.5,
                    color=MARINO,
                    negrita=True,
                )
                self.texto(
                    self.x_tiempo - 5, y + fila.alto / 2 + 2.5, cuenta, tamano=6.5,
                    color=HexColor(ROJO) if fila.vencidas else TENUE, derecha=True,
                )
                self.barra_grupo(fila, y)
            else:
                self.fila_card(fila.card, y, ancho_texto)
            self.linea(MARGEN, y + fila.alto, self.x_tiempo + self.ancho_tiempo, y + fila.alto, mezcla("#e3e6f2", 70))
            y += fila.alto
        # Separador de la columna de títulos.
        self.linea(self.x_tiempo, self.y_diagrama, self.x_tiempo, self.y_filas + self.alto_filas, LINEA, grosor=0.7)

    def recorte(self, x1: float, x2: float) -> tuple[float, float] | None:
        a, b = max(x1, self.x_tiempo), min(x2, self.x_tiempo + self.ancho_tiempo)
        return (a, b) if b > a else None

    def barra_grupo(self, fila: Fila, y: float) -> None:
        tramo = self.recorte(self.x(fila.desde), self.x(fila.hasta) + self.plan.pt_dia)
        if not tramo:
            return
        x1, x2 = tramo
        yb = y + fila.alto / 2 - 1.5
        self.rect(x1, yb, x2 - x1, 3, relleno=mezcla(fila.color, 22), radio=1.5)
        if fila.total:
            lleno = self.recorte(self.x(fila.desde), self.x(fila.desde) + (self.x(fila.hasta) + self.plan.pt_dia - self.x(fila.desde)) * fila.hechas / fila.total)
            if lleno:
                self.rect(lleno[0], yb, lleno[1] - lleno[0], 3, relleno=HexColor(fila.color), radio=1.5)

    def fila_card(self, card, y: float, ancho_texto: float) -> None:
        c = self.plan.c
        estado = c.vencimiento(card)
        terminada, vencida = estado == "terminada", estado == "vencida"
        color = VERDE if terminada else URGENCIAS[card.urgencia][1]
        sangria = 14 if self.plan.opciones.agrupar != "ninguna" else 6
        self.rect(MARGEN + sangria - 5, y + 4, 1.8, ALTO_FILA - 8, relleno=HexColor(URGENCIAS[card.urgencia][1]))
        titulo = f"#{card.numero}  {card.titulo}"
        self.texto(
            MARGEN + sangria,
            y + ALTO_FILA / 2 + 2.5,
            _recortar(titulo, FUENTE, 7, ancho_texto - sangria + 6),
            tamano=7,
            color=TENUE if terminada else TEXTO,
        )

        x1_real, x2_real, centro = self.cajas[card.pk]
        if card.es_hito:
            self.hito(card, x1_real, x2_real, centro, color, vencida)
            return
        tramo = self.recorte(x1_real, x2_real)
        if not tramo:
            return
        x1, x2 = tramo
        ancho = max(x2 - x1, 1.5)
        yb = centro - ALTO_BARRA / 2
        self.rect(x1, yb, ancho, ALTO_BARRA, relleno=mezcla(color, 16), borde=HexColor(ROJO) if vencida else mezcla(color, 45), grosor=0.7 if vencida else 0.5, radio=2.5)
        items = list(card.checklist.all())
        avance = 1 if terminada else (sum(i.hecho for i in items) / len(items) if items else 0)
        if avance:
            lleno = self.recorte(x1_real, x1_real + (x2_real - x1_real) * avance)
            if lleno:
                self.rect(lleno[0], yb, lleno[1] - lleno[0], ALTO_BARRA, relleno=mezcla(color, 34), radio=2.5)
        # Título dentro de la barra si cabe; si no, a su derecha si hay sitio.
        nombre = _seguro(card.titulo)
        if stringWidth(nombre, FUENTE, 6) + 8 <= ancho:
            self.texto(x1 + 4, centro + 2.1, nombre, tamano=6, color=HexColor("#047857") if terminada else MARINO)
        else:
            libre = self.x_tiempo + self.ancho_tiempo - (x1 + ancho) - 6
            if libre > 30:
                recortado = _recortar(nombre, FUENTE, 6, libre)
                # Fondo blanco: que una flecha que pase por debajo no tache el título.
                self.rect(x1 + ancho + 2.5, centro - 3.6, stringWidth(recortado, FUENTE, 6) + 3, 6.4, relleno=white)
                self.texto(x1 + ancho + 4, centro + 2.1, recortado, tamano=6, color=TENUE)

    def rombo(self, xc: float, yc: float, radio: float, relleno, borde, grosor: float = 0.8) -> None:
        ruta = self.l.beginPath()
        ruta.moveTo(xc, self.Y(yc - radio))
        for x, y in ((xc + radio, yc), (xc, yc + radio), (xc - radio, yc)):
            ruta.lineTo(x, self.Y(y))
        ruta.close()
        self.l.setFillColor(relleno)
        self.l.setStrokeColor(borde)
        self.l.setLineWidth(grosor)
        self.l.drawPath(ruta, fill=1, stroke=1)

    def hito(self, card, x1_real: float, x2_real: float, centro: float, color: str, vencida: bool) -> None:
        """Un hito (tarjeta con una etiqueta `es_hito`) es un rombo en su último
        día, como en la pantalla; si dura varios días, una línea fina hasta él."""
        xc = x2_real - self.plan.pt_dia / 2
        radio = ALTO_BARRA / 2 + 1
        previo = self.recorte(x1_real, xc - radio)
        if previo:
            self.linea(previo[0], centro, previo[1], centro, mezcla(color, 60), grosor=1.4)
        if not self.x_tiempo <= xc <= self.x_tiempo + self.ancho_tiempo:
            return
        self.rombo(xc, centro, radio, HexColor(color), HexColor(ROJO) if vencida else white)
        libre = self.x_tiempo + self.ancho_tiempo - (xc + radio) - 6
        if libre > 30:
            recortado = _recortar(_seguro(card.titulo), FUENTE_NEGRITA, 6, libre)
            self.rect(xc + radio + 2.5, centro - 3.6, stringWidth(recortado, FUENTE_NEGRITA, 6) + 3, 6.4, relleno=white)
            self.texto(xc + radio + 4, centro + 2.1, recortado, tamano=6, color=TEXTO, negrita=True)

    # --- Dependencias (espejo de rutaFlecha) ---
    def flechas(self) -> None:
        cards = {card.pk: card for card in self.plan.c.cards}
        self.l.saveState()
        recorte = self.l.beginPath()
        recorte.rect(self.x_tiempo, self.Y(self.y_filas + self.alto_filas), self.ancho_tiempo, self.alto_filas)
        self.l.clipPath(recorte, stroke=0, fill=0)
        for dep in self.plan.c.dependencias:
            pred, suc = self.cajas.get(dep.predecesora_id), self.cajas.get(dep.sucesora_id)
            if not pred or not suc:
                continue  # alguna punta está en otra hoja o en un grupo plegado
            rota = incumple(dep, cards.get(dep.predecesora_id), cards.get(dep.sucesora_id))
            puntos = _ruta(dep.tipo, pred, suc)
            color = HexColor(ROJO) if rota else HexColor("#8a91b8")
            self.l.setStrokeColor(color)
            self.l.setFillColor(color)
            self.l.setLineWidth(0.7)
            self.l.setDash(*(([2.2, 1.6], 0) if rota else ([], 0)))
            camino = self.l.beginPath()
            camino.moveTo(puntos[0][0], self.Y(puntos[0][1]))
            for px, py in puntos[1:]:
                camino.lineTo(px, self.Y(py))
            self.l.drawPath(camino, stroke=1, fill=0)
            self.l.setDash([], 0)
            # Punta de flecha hacia la dirección del último tramo.
            (ax, ay), (bx, by) = puntos[-2], puntos[-1]
            sentido = 1 if bx >= ax else -1
            punta = self.l.beginPath()
            punta.moveTo(bx, self.Y(by))
            punta.lineTo(bx - 3.2 * sentido, self.Y(by - 2))
            punta.lineTo(bx - 3.2 * sentido, self.Y(by + 2))
            punta.close()
            self.l.drawPath(punta, stroke=0, fill=1)
        self.l.restoreState()

    def hoy(self) -> None:
        hoy = self.plan.c.hoy
        if not (self.p.desde <= hoy <= self.p.hasta) or not self.alto_filas:
            return
        x = self.x(hoy) + self.plan.pt_dia / 2
        self.linea(x, self.y_diagrama + ALTO_ESCALA - 4, x, self.y_filas + self.alto_filas, HexColor("#ed2546"), grosor=0.9)
        self.rect(x - 9, self.y_diagrama + ALTO_ESCALA - 9, 18, 7, relleno=HexColor("#ed2546"), radio=3)
        self.texto(x - 6.5, self.y_diagrama + ALTO_ESCALA - 3.6, "HOY", tamano=4.8, color=white, negrita=True)

    # --- Pie: leyenda y número de hoja ---
    def pie(self) -> None:
        y = self.plan.alto - MARGEN - ALTO_PIE + 14
        x = MARGEN
        for clave in ORDEN_URGENCIA:
            nombre, color = URGENCIAS[clave]
            self.rect(x, y - 6, 14, 6, relleno=mezcla(color, 16), borde=mezcla(color, 45), radio=2)
            self.texto(x + 18, y, nombre, tamano=6.5, color=TENUE)
            x += 24 + stringWidth(nombre, FUENTE, 6.5)
        elementos = [
            ("terminada", "Terminada"),
            ("vencida", "Vencida (borde rojo)"),
            ("avance", "Avance del checklist"),
            ("hito", "Hito"),
            ("hoy", "Hoy"),
            ("feriado", "Feriado"),
            ("dep", "Dependencia"),
            ("rota", "Dependencia incumplida"),
        ]
        for tipo, nombre in elementos:
            if tipo == "terminada":
                self.rect(x, y - 6, 14, 6, relleno=mezcla(VERDE, 34), borde=mezcla(VERDE, 45), radio=2)
            elif tipo == "vencida":
                self.rect(x, y - 6, 14, 6, relleno=mezcla("#2563eb", 16), borde=HexColor(ROJO), grosor=0.7, radio=2)
            elif tipo == "avance":
                self.rect(x, y - 6, 14, 6, relleno=mezcla("#2563eb", 16), borde=mezcla("#2563eb", 45), radio=2)
                self.rect(x, y - 6, 8, 6, relleno=mezcla("#2563eb", 34), radio=2)
            elif tipo == "hito":
                self.rombo(x + 7, y - 3, 4, HexColor("#2563eb"), white)
            elif tipo == "hoy":
                self.linea(x + 7, y - 8, x + 7, y + 1, HexColor("#ed2546"), grosor=0.9)
            elif tipo == "feriado":
                self.rect(x + 2, y - 7, 10, 8, relleno=mezcla(ROJO, 12))
            else:
                self.linea(x, y - 3, x + 14, y - 3, HexColor(ROJO if tipo == "rota" else "#8a91b8"), grosor=0.8, discontinua=([2.2, 1.6], 0) if tipo == "rota" else None)
            self.texto(x + 18, y, nombre, tamano=6.5, color=TENUE)
            x += 26 + stringWidth(nombre, FUENTE, 6.5)

        total = len(self.plan.paginas)
        pie = f"Hoja {self.numero} de {total}"
        if self.p.tramos > 1:
            pie = f"Tramo {self.p.tramo} de {self.p.tramos} ({_fecha_corta(self.p.desde)} – {_fecha_corta(self.p.hasta)}) · " + pie
        self.texto(self.plan.ancho - MARGEN, y + 14, pie, tamano=6.5, color=TENUE, derecha=True)
        self.texto(MARGEN, y + 14, "Planificación · Paldaca", tamano=6.5, color=TENUE)


def _ruta(tipo: str, pred: tuple[float, float, float], suc: tuple[float, float, float]) -> list[tuple[float, float]]:
    """Puntos de la flecha (x, y desde arriba). Espejo de `rutaFlecha` en lib/gantt.ts."""
    g = 5.0
    p1, p2, y1 = pred
    s1, s2, y2 = suc
    sale = p1 if tipo == TipoDependencia.INICIO_INICIO else p2
    if tipo == TipoDependencia.FIN_FIN:
        xm = max(sale, s2) + g
        return [(sale, y1), (xm, y1), (xm, y2), (s2 + 1, y2)]
    llega = s1
    salida = sale - g if tipo == TipoDependencia.INICIO_INICIO else sale + g
    if llega - g >= salida or tipo == TipoDependencia.INICIO_INICIO:
        xm = min(salida, llega - g) if tipo == TipoDependencia.INICIO_INICIO else max(salida, llega - g)
        return [(sale, y1), (xm, y1), (xm, y2), (llega - 1, y2)]
    hueco = y1 + (ALTO_FILA / 2 if y2 > y1 else -ALTO_FILA / 2)
    return [(sale, y1), (salida, y1), (salida, hueco), (llega - g, hueco), (llega - g, y2), (llega - 1, y2)]
