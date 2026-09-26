"""
Guardar un tablero como plantilla y crear tableros desde una plantilla.

Formato del `contenido` (versión `FORMATO`):

    {
      "formato": 1,
      "columnas":  [{"nombre", "es_final", "incluir_en_gantt", "limite_cards"}],
      "etiquetas": [{"nombre", "color"}],
      "campos":    [{"nombre", "tipo", "opciones", "visible_en_tarjeta"}],
      "tarjetas":  [{"ref", "titulo", "descripcion", "columna" (índice), "urgencia",
                     "en_gantt", "inicio", "fin" (días hábiles desde el inicio del
                     proyecto, o null), "etiquetas" [nombres], "campos" {nombre: valor},
                     "checklist" [textos], "depende" [[ref, tipo, desfase]]}]
    }

Las fechas se guardan **relativas en días hábiles** al primer día hábil del
proyecto; al usar la plantilla se suman al día de inicio elegido con el
calendario laboral (feriados incluidos). No se guardan personas, comentarios
ni historial.
"""

from __future__ import annotations

import datetime

from django.db import transaction

from calendario.services.dias_habiles import dias_habiles_hasta, siguiente_habil, sumar_habiles
from core.errores import ReglaDeNegocio
from gantt.models import Dependencia
from gantt.services.dependencias import crear_dependencia
from plantillas.models import AlcancePlantilla, Plantilla
from tableros.models import Card, Tablero, TipoTablero
from tableros.services import campos as servicio_campos
from tableros.services import checklist as servicio_checklist
from tableros.services import etiquetas as servicio_etiquetas
from tableros.services import tableros as servicio_tableros
from tableros.services import tarjetas as servicio_tarjetas

FORMATO = 1
MAX_TARJETAS = 500


def _desfase(base: datetime.date, fecha: datetime.date | None) -> int | None:
    if fecha is None:
        return None
    return dias_habiles_hasta(base, siguiente_habil(fecha))


def foto(tablero: Tablero) -> dict:
    """El contenido de una plantilla a partir de un tablero (solo lo activo)."""
    columnas = list(tablero.columnas.activas())
    indice = {c.pk: i for i, c in enumerate(columnas)}
    cards = list(
        Card.objects.filter(tablero=tablero)
        .activas()
        .prefetch_related("etiquetas", "checklist")
        .order_by("columna__orden", "orden", "id")
    )
    if len(cards) > MAX_TARJETAS:
        raise ReglaDeNegocio(f"Una plantilla admite hasta {MAX_TARJETAS} tarjetas.")
    fechas = [f for c in cards for f in (c.fecha_inicio, c.fecha_fin) if f]
    base = siguiente_habil(min(fechas)) if fechas else None
    campos = list(tablero.campos.filter(archivado=False))
    nombre_de = {str(c.pk): c.nombre for c in campos}
    ids = {c.pk: c.numero for c in cards}
    depende: dict[int, list] = {}
    for d in Dependencia.objects.del_tablero(tablero):
        if d.predecesora_id in ids and d.sucesora_id in ids:
            depende.setdefault(d.sucesora_id, []).append([ids[d.predecesora_id], d.tipo, d.desfase_dias])

    return {
        "formato": FORMATO,
        "columnas": [
            {
                "nombre": c.nombre,
                "es_final": c.es_final,
                "incluir_en_gantt": c.incluir_en_gantt,
                "limite_cards": c.limite_cards,
            }
            for c in columnas
        ],
        "etiquetas": [{"nombre": e.nombre, "color": e.color} for e in tablero.etiquetas.all()],
        "campos": [
            {"nombre": c.nombre, "tipo": c.tipo, "opciones": c.opciones, "visible_en_tarjeta": c.visible_en_tarjeta}
            for c in campos
        ],
        "tarjetas": [
            {
                "ref": c.numero,
                "titulo": c.titulo,
                "descripcion": c.descripcion,
                "columna": indice[c.columna_id],
                "urgencia": c.urgencia,
                "en_gantt": c.en_gantt,
                "inicio": _desfase(base, c.fecha_inicio) if base else None,
                "fin": _desfase(base, c.fecha_fin) if base else None,
                "etiquetas": [e.nombre for e in c.etiquetas.all()],
                "campos": {nombre_de[k]: v for k, v in (c.campos or {}).items() if k in nombre_de},
                "checklist": [i.texto for i in c.checklist.all()],
                "depende": depende.get(c.pk, []),
            }
            for c in cards
        ],
    }


def resumen(contenido: dict) -> dict:
    """Para listar: cuántas columnas y tarjetas, y cuánto dura en días hábiles."""
    tarjetas = contenido.get("tarjetas", [])
    finales = [t["fin"] for t in tarjetas if t.get("fin") is not None] + [
        t["inicio"] for t in tarjetas if t.get("inicio") is not None
    ]
    return {
        "columnas": len(contenido.get("columnas", [])),
        "tarjetas": len(tarjetas),
        "etiquetas": len(contenido.get("etiquetas", [])),
        "campos": len(contenido.get("campos", [])),
        "duracion": (max(finales) + 1) if finales else None,
    }


def _nombre(nombre: str) -> str:
    if not nombre or not nombre.strip():
        raise ReglaDeNegocio("Ponle un nombre a la plantilla.")
    return nombre.strip()[:100]


@transaction.atomic
def guardar_como_plantilla(
    tablero: Tablero, *, nombre: str, descripcion: str = "", alcance: str, equipo=None, actor
) -> Plantilla:
    if alcance == AlcancePlantilla.EQUIPO and equipo is None:
        raise ReglaDeNegocio("Elige el equipo de la plantilla.")
    return Plantilla.objects.create(
        nombre=_nombre(nombre),
        descripcion=(descripcion or "").strip()[:2000],
        alcance=alcance,
        propietario=actor if alcance == AlcancePlantilla.PERSONAL else None,
        equipo=equipo if alcance == AlcancePlantilla.EQUIPO else None,
        contenido=foto(tablero),
        creada_por=actor,
    )


def editar_plantilla(plantilla: Plantilla, *, nombre: str | None = None, descripcion: str | None = None) -> Plantilla:
    if nombre is not None:
        plantilla.nombre = _nombre(nombre)
    if descripcion is not None:
        plantilla.descripcion = descripcion.strip()[:2000]
    plantilla.save()
    return plantilla


def eliminar_plantilla(plantilla: Plantilla) -> None:
    """Una plantilla es un molde: borrarla no toca los tableros creados con ella."""
    plantilla.delete()


@transaction.atomic
def crear_tablero_desde(
    plantilla: Plantilla, *, nombre: str, fecha_inicio: datetime.date, equipo=None, actor
) -> Tablero:
    """Tablero nuevo (personal si no hay `equipo`) con la estructura y las
    tarjetas de la plantilla; las fechas empiezan en `fecha_inicio` (o el
    siguiente día hábil) y avanzan en días hábiles."""
    c = plantilla.contenido
    if c.get("formato") != FORMATO:
        raise ReglaDeNegocio("La plantilla tiene un formato que esta versión no entiende.")
    if not nombre or not nombre.strip():
        raise ReglaDeNegocio("Ponle un nombre al tablero.")
    tablero = servicio_tableros.crear_tablero(
        nombre=nombre.strip()[:100],
        descripcion=plantilla.descripcion,
        tipo=TipoTablero.EQUIPO if equipo else TipoTablero.PERSONAL,
        equipo=equipo,
        propietario=None if equipo else actor,
        creado_por=actor,
        columnas=c["columnas"] or None,
    )
    columnas = list(tablero.columnas.activas())
    etiquetas = {
        e["nombre"]: servicio_etiquetas.crear_etiqueta(tablero, nombre=e["nombre"], color=e["color"])
        for e in c.get("etiquetas", [])
    }
    campos = {
        d["nombre"]: servicio_campos.crear_campo(
            tablero,
            nombre=d["nombre"],
            tipo=d["tipo"],
            opciones=d.get("opciones"),
            visible_en_tarjeta=d.get("visible_en_tarjeta", False),
        )
        for d in c.get("campos", [])
    }
    base = siguiente_habil(fecha_inicio)
    creadas: dict[int, Card] = {}
    for t in c.get("tarjetas", []):
        valores = {}
        for nombre_campo, valor in (t.get("campos") or {}).items():
            campo = campos.get(nombre_campo)
            if campo is not None:
                try:
                    valores[str(campo.pk)] = servicio_campos.valor_valido(campo, valor)
                except ReglaDeNegocio:
                    continue
        card = servicio_tarjetas.crear_card(
            tablero=tablero,
            columna=columnas[min(t["columna"], len(columnas) - 1)],
            titulo=t["titulo"],
            descripcion=t.get("descripcion", ""),
            urgencia=t.get("urgencia", "media"),
            en_gantt=t.get("en_gantt", "heredar"),
            fecha_inicio=sumar_habiles(base, t["inicio"]) if t.get("inicio") is not None else None,
            fecha_fin=sumar_habiles(base, t["fin"]) if t.get("fin") is not None else None,
            etiquetas=[etiquetas[n] for n in t.get("etiquetas", []) if n in etiquetas],
            valores_campos={k: v for k, v in valores.items() if v is not None},
            actor=actor,
            avisar=False,
        )
        for texto in t.get("checklist", []):
            servicio_checklist.agregar_item(card, texto=texto, actor=actor)
        creadas[t["ref"]] = card
    for t in c.get("tarjetas", []):
        for ref, tipo, desfase in t.get("depende", []):
            if ref in creadas:
                try:
                    with transaction.atomic():
                        crear_dependencia(
                            predecesora=creadas[ref], sucesora=creadas[t["ref"]], tipo=tipo, desfase_dias=desfase, actor=actor
                        )
                except ReglaDeNegocio:
                    continue
    return tablero
