"""
Qué se exporta y cómo se nombra: lo comparten Excel, MS Project y la
importación (así un archivo exportado se puede volver a importar).

- Filtros: los mismos del tablero en pantalla (`frontend/src/lib/filtros.ts`),
  para que «exportar» saque exactamente lo que se está viendo.
- Dependencias en texto, estilo MS Project en español: `3` (fin→comienzo),
  `3CC+2` (comienzo→comienzo, 2 días hábiles de desfase), `3FF-1`.
"""

from __future__ import annotations

import datetime
import re
import unicodedata
from dataclasses import dataclass, field

from django.utils import timezone

from gantt.models import Dependencia, TipoDependencia
from integracion_portal.services.personas import nombre as nombre_persona
from tableros.models import Card, Tablero, Urgencia
from tableros.services.vencimientos import umbral_por_vencer, vencimiento

#: Siglas de MS Project en español.
SIGLA_TIPO = {
    TipoDependencia.FIN_INICIO: "FC",
    TipoDependencia.INICIO_INICIO: "CC",
    TipoDependencia.FIN_FIN: "FF",
}
TIPO_SIGLA = {v: k for k, v in SIGLA_TIPO.items()}
_REFERENCIA = re.compile(r"#?\s*(\d+)\s*(FC|CC|FF)?\s*([+-]\s*\d+)?", re.IGNORECASE)


@dataclass(frozen=True)
class Filtros:
    texto: str = ""
    urgencias: tuple[str, ...] = ()
    responsables: tuple[int, ...] = ()
    etiquetas: tuple[int, ...] = ()
    solo_vencidas: bool = False

    @classmethod
    def desde_query(cls, params) -> Filtros:
        def enteros(clave):
            return tuple(int(v) for v in params.getlist(clave) if str(v).isdigit())

        return cls(
            texto=(params.get("q") or "").strip().lower(),
            urgencias=tuple(params.getlist("urgencia")),
            responsables=enteros("responsable"),
            etiquetas=enteros("etiqueta"),
            solo_vencidas=params.get("vencidas") in ("1", "true"),
        )

    def describir(self, tablero: Tablero) -> str:
        """«Urgencia: Alta · Responsable: Beto» (vacío si no hay filtros)."""
        partes = []
        if self.texto:
            partes.append(f"Texto: «{self.texto}»")
        if self.urgencias:
            etiquetas = dict(Urgencia.choices)
            partes.append("Urgencia: " + ", ".join(etiquetas.get(u, u) for u in self.urgencias))
        if self.responsables:
            nombres = [nombre_persona(p) for p in tablero.personas_asignables() if p.pk in self.responsables]
            partes.append("Responsable: " + ", ".join(nombres or ["(ninguno del tablero)"]))
        if self.etiquetas:
            nombres = [e.nombre for e in tablero.etiquetas.all() if e.pk in self.etiquetas]
            partes.append("Etiqueta: " + ", ".join(nombres or ["(ninguna del tablero)"]))
        if self.solo_vencidas:
            partes.append("Solo vencidas o por vencer")
        return " · ".join(partes)

    def aplicar(self, cards: list[Card], hoy: datetime.date, umbral: int) -> list[Card]:
        resultado = []
        for c in cards:
            if self.texto and self.texto not in c.titulo.lower() and self.texto not in f"#{c.numero}":
                continue
            if self.urgencias and c.urgencia not in self.urgencias:
                continue
            if self.responsables and not {a.usuario_id for a in c.asignaciones.all()} & set(self.responsables):
                continue
            if self.etiquetas and not {e.pk for e in c.etiquetas.all()} & set(self.etiquetas):
                continue
            if self.solo_vencidas and vencimiento(c, hoy, umbral) not in ("vencida", "vence_pronto"):
                continue
            resultado.append(c)
        return resultado


@dataclass
class Contenido:
    """Lo que se exporta de un tablero (ya filtrado)."""

    tablero: Tablero
    cards: list[Card]
    dependencias: list[Dependencia]
    hoy: datetime.date
    umbral: int
    #: Filtros aplicados en palabras («» = todas las tarjetas activas).
    filtros: str = ""
    #: Campos personalizados activos del tablero (una columna cada uno).
    campos: list = field(default_factory=list)

    def vencimiento(self, card: Card) -> str:
        return vencimiento(card, self.hoy, self.umbral)


def contenido(tablero: Tablero, filtros: Filtros | None = None) -> Contenido:
    hoy = timezone.localdate()
    umbral = umbral_por_vencer()
    cards = list(
        Card.objects.filter(tablero=tablero)
        .activas()
        .select_related("columna")
        .prefetch_related("asignaciones__usuario", "checklist", "etiquetas")
        .order_by("columna__orden", "orden", "id")
    )
    if filtros:
        cards = filtros.aplicar(cards, hoy, umbral)
    ids = {c.pk for c in cards}
    deps = [
        d
        for d in Dependencia.objects.del_tablero(tablero).order_by("id")
        if d.predecesora_id in ids and d.sucesora_id in ids
    ]
    return Contenido(
        tablero=tablero,
        cards=cards,
        dependencias=deps,
        hoy=hoy,
        umbral=umbral,
        filtros=filtros.describir(tablero) if filtros else "",
        campos=list(tablero.campos.filter(archivado=False)),
    )


# --- Texto compartido -------------------------------------------------------------------


def etiquetas_texto(card: Card) -> str:
    return ", ".join(e.nombre for e in card.etiquetas.all())


def responsables_texto(card: Card) -> str:
    return ", ".join(nombre_persona(a.usuario) for a in card.asignaciones.all())


def referencia_texto(numero: int, tipo: str, desfase: int) -> str:
    """(3, fin_inicio, 0) → «3»; (3, inicio_inicio, 2) → «3CC+2»."""
    sigla = "" if tipo == TipoDependencia.FIN_INICIO and not desfase else SIGLA_TIPO[tipo]
    return f"{numero}{sigla}{f'{desfase:+d}' if desfase else ''}"


def referencia(dep: Dependencia, numero_predecesora: int) -> str:
    return referencia_texto(numero_predecesora, dep.tipo, dep.desfase_dias)


def leer_referencias(texto: str) -> tuple[list[tuple[int, str, int]], list[str]]:
    """«3, 5CC+2» → ([(3, fin_inicio, 0), (5, inicio_inicio, 2)], errores)."""
    refs, errores = [], []
    for parte in re.split(r"[;,]", str(texto or "")):
        parte = parte.strip()
        if not parte:
            continue
        m = _REFERENCIA.fullmatch(parte)
        if not m:
            errores.append(f"«{parte}» no es una referencia válida (ej.: 3, 3CC+2).")
            continue
        tipo = TIPO_SIGLA[(m.group(2) or "FC").upper()]
        desfase = int(m.group(3).replace(" ", "")) if m.group(3) else 0
        refs.append((int(m.group(1)), tipo, desfase))
    return refs, errores


def normalizar(texto) -> str:
    """Para comparar encabezados y nombres sin tildes ni mayúsculas."""
    base = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", base).strip().lower()


def nombre_archivo(tablero: Tablero, extension: str) -> str:
    seguro = re.sub(r"[^\w\- ]+", "", normalizar(tablero.nombre)).strip().replace(" ", "-") or "tablero"
    return f"{seguro}-{timezone.localdate():%Y%m%d}.{extension}"
