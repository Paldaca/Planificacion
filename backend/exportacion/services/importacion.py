"""
Importar tarjetas desde un archivo (Excel o MS Project) en dos pasos:

1. `vista_previa`: lee y valida sin tocar la base. Cada fila trae sus
   **errores** (no se importará) y **avisos** (se importa con un ajuste, p. ej.
   una columna desconocida cae en la primera).
2. `importar`: vuelve a validar el mismo archivo y crea, en UNA transacción,
   las filas sin errores y sus dependencias. No se guarda nada entre pasos:
   el navegador vuelve a enviar el archivo.

Los responsables reciben un solo aviso agrupado («Te asignaron 12 tarjetas»)
en lugar de uno por tarjeta.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from django.db import transaction

from core.errores import ReglaDeNegocio
from gantt.services.dependencias import crear_dependencia
from integracion_portal.services import notificaciones as n
from integracion_portal.services.personas import nombre as nombre_persona
from tableros import permisos
from tableros.models import Columna, Tablero, Urgencia
from tableros.services import tarjetas

from . import excel, mspdi
from .datos import normalizar, referencia_texto
from .modelo import FilaEntrada

MAX_BYTES = 5 * 1024 * 1024
MAX_FILAS = 1000

_URGENCIAS = {normalizar(etiqueta): valor for valor, etiqueta in Urgencia.choices} | {
    normalizar(valor): valor for valor, _ in Urgencia.choices
} | {"urgente": Urgencia.CRITICA, "normal": Urgencia.MEDIA}


@dataclass
class FilaResuelta:
    entrada: FilaEntrada
    columna: Columna | None = None
    urgencia: str = Urgencia.MEDIA
    responsables: list = field(default_factory=list)

    @property
    def valida(self) -> bool:
        return not self.entrada.errores


def leer_archivo(nombre: str, contenido: bytes) -> list[FilaEntrada]:
    if len(contenido) > MAX_BYTES:
        raise ReglaDeNegocio("El archivo supera los 5 MB.")
    extension = nombre.lower().rsplit(".", 1)[-1] if "." in nombre else ""
    try:
        if extension == "xlsx":
            filas = excel.leer(contenido, limite=MAX_FILAS + 1)
        elif extension == "xml":
            filas = mspdi.leer(contenido)
        else:
            raise ReglaDeNegocio("Formato no admitido: sube un Excel (.xlsx) o un XML de MS Project (.xml).")
    except ValueError as exc:
        raise ReglaDeNegocio(str(exc)) from exc
    if not filas:
        raise ReglaDeNegocio("El archivo no tiene tarjetas para importar.")
    if len(filas) > MAX_FILAS:
        raise ReglaDeNegocio(f"Se pueden importar hasta {MAX_FILAS} tarjetas por archivo.")
    return filas


def resolver(tablero: Tablero, entradas: list[FilaEntrada]) -> list[FilaResuelta]:
    columnas = list(tablero.columnas.activas())
    if not columnas:
        raise ReglaDeNegocio("El tablero no tiene columnas.")
    por_nombre = {normalizar(c.nombre): c for c in columnas}
    final = next((c for c in columnas if c.es_final), None)
    personas: dict[str, object] = {}
    for p in tablero.personas_asignables():
        for clave in (nombre_persona(p), p.username, p.email, p.get_full_name()):
            if clave:
                personas.setdefault(normalizar(clave), p)

    refs_vistas: set[int] = set()
    resueltas = []
    for e in entradas:
        r = FilaResuelta(entrada=e)
        if not e.titulo:
            e.errores.append("Falta el título.")
        elif len(e.titulo) > 200:
            e.errores.append("El título pasa de 200 caracteres.")
        if e.inicio and e.fin and e.fin < e.inicio:
            e.errores.append("La fecha final es anterior a la de inicio.")
        if e.ref is not None:
            if e.ref in refs_vistas:
                e.errores.append(f"El número {e.ref} está repetido en el archivo.")
            refs_vistas.add(e.ref)

        if e.completada and final:
            r.columna = final
        elif e.columna:
            r.columna = por_nombre.get(normalizar(e.columna))
            if r.columna is None:
                e.avisos.append(f"No hay columna «{e.columna}»: irá a «{columnas[0].nombre}».")
        r.columna = r.columna or columnas[0]

        if e.urgencia:
            r.urgencia = _URGENCIAS.get(normalizar(e.urgencia), Urgencia.MEDIA)
            if normalizar(e.urgencia) not in _URGENCIAS:
                e.avisos.append(f"Urgencia «{e.urgencia}» desconocida: queda Media.")

        for nombre in e.responsables:
            persona = personas.get(normalizar(nombre))
            if persona is None:
                e.avisos.append(f"«{nombre}» no está en este tablero: no se asigna.")
            elif persona not in r.responsables:
                r.responsables.append(persona)
        resueltas.append(r)

    # Referencias a filas que no existen (o que no se importarán).
    validas = {r.entrada.ref for r in resueltas if r.valida and r.entrada.ref is not None}
    for r in resueltas:
        for ref, _tipo, _desfase in r.entrada.depende:
            if ref not in validas:
                r.entrada.avisos.append(f"Depende de {ref}, que no se importa: se omite ese vínculo.")
    return resueltas


def _serializar(r: FilaResuelta) -> dict:
    e = r.entrada
    return {
        "fila": e.fila,
        "ref": e.ref,
        "titulo": e.titulo,
        "columna": r.columna.nombre if r.columna else None,
        "urgencia": r.urgencia,
        "inicio": e.inicio.isoformat() if e.inicio else None,
        "fin": e.fin.isoformat() if e.fin else None,
        "responsables": [nombre_persona(p) for p in r.responsables],
        "depende": [referencia_texto(ref, tipo, d) for ref, tipo, d in e.depende],
        "errores": e.errores,
        "avisos": e.avisos,
    }


def vista_previa(tablero: Tablero, nombre: str, contenido: bytes) -> dict:
    resueltas = resolver(tablero, leer_archivo(nombre, contenido))
    validas = [r for r in resueltas if r.valida]
    return {
        "filas": [_serializar(r) for r in resueltas],
        "total": len(resueltas),
        "validas": len(validas),
        "con_errores": len(resueltas) - len(validas),
        "dependencias": sum(len(r.entrada.depende) for r in validas),
    }


def importar(tablero: Tablero, nombre: str, contenido: bytes, *, actor) -> dict:
    resueltas = resolver(tablero, leer_archivo(nombre, contenido))
    validas = [r for r in resueltas if r.valida]
    if not validas:
        raise ReglaDeNegocio("Ninguna fila se puede importar: revisa los errores de la vista previa.")

    creadas: dict[int, object] = {}  # «#» del archivo → tarjeta nueva
    por_persona: dict[int, list] = defaultdict(list)
    personas: dict[int, object] = {}
    omitidas_dep: list[str] = []
    with transaction.atomic():
        cards = []  # alineada con `validas`
        for r in validas:
            e = r.entrada
            card = tarjetas.crear_card(
                tablero=tablero,
                columna=r.columna,
                titulo=e.titulo,
                descripcion=e.descripcion,
                urgencia=r.urgencia,
                fecha_inicio=e.inicio,
                fecha_fin=e.fin,
                responsables=r.responsables,
                actor=actor,
                avisar=False,
            )
            cards.append(card)
            if e.ref is not None:
                creadas[e.ref] = card
            for p in r.responsables:
                por_persona[p.pk].append(card)
                personas[p.pk] = p
        dependencias = 0
        for r, sucesora in zip(validas, cards):
            for ref, tipo, desfase in r.entrada.depende:
                if ref not in creadas:
                    continue
                try:
                    with transaction.atomic():
                        crear_dependencia(
                            predecesora=creadas[ref],
                            sucesora=sucesora,
                            tipo=tipo,
                            desfase_dias=desfase,
                            actor=actor,
                        )
                    dependencias += 1
                except ReglaDeNegocio as exc:
                    omitidas_dep.append(f"Fila {r.entrada.fila}: {exc}")
        _avisar_asignaciones(tablero, {pk: (personas[pk], cs) for pk, cs in por_persona.items()}, actor)

    return {
        "creadas": len(cards),
        "omitidas": len(resueltas) - len(validas),
        "dependencias": dependencias,
        "avisos": omitidas_dep,
    }


def _avisar_asignaciones(tablero: Tablero, por_persona: dict[int, tuple], actor) -> None:
    """Un aviso por persona, no uno por tarjeta. Nunca a quien importa."""
    donde = f"{tablero.nombre} · {tablero.equipo.nombre}" if tablero.equipo_id else tablero.nombre
    for usuario, cards in por_persona.values():
        if usuario.pk == getattr(actor, "pk", None) or not permisos.puede_ver_tablero(usuario, tablero):
            continue
        cantidad = len(cards)
        n.emitir(
            codigo=n.CARD_ASIGNADA,
            titulo=f"Te asignaron {cantidad} tarjeta{'s' if cantidad != 1 else ''} en {tablero.nombre}",
            cuerpo=f"{nombre_persona(actor)} las importó en {donde}.",
            destinatarios=[usuario],
            actor=actor,
            ruta=f"/tableros/{tablero.pk}",
        )
