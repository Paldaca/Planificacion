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

Columnas y etiquetas que el archivo nombra y el tablero no tiene: la vista
previa las resume una vez (`faltantes`, no un aviso por fila) y, si quien
importa gestiona el tablero y lo pide (`Crear`), `importar` las crea en la
misma transacción que las tarjetas. Las columnas nuevas van antes de la
columna final y **dentro del Gantt**: no se adivina nada por el nombre (una
«Pendientes» se saca del Gantt a mano si se quiere).
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
from tableros.services.campos import valor_valido
from tableros.services.columnas import crear_columna, reordenar_columnas
from tableros.services.etiquetas import MAX_ETIQUETAS, crear_etiqueta

from . import excel, mspdi
from .datos import normalizar, referencia_texto
from .modelo import FilaEntrada

MAX_BYTES = 5 * 1024 * 1024
MAX_FILAS = 1000

#: Colores para las etiquetas que crea la importación (se saltan los ya usados).
COLORES_ETIQUETA = [
    "#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2",
    "#65a30d", "#dc2626", "#4f46e5", "#0d9488", "#b45309", "#475569",
]


@dataclass(frozen=True)
class Crear:
    """Qué crear de lo que el archivo nombra y el tablero no tiene."""

    etiquetas: bool = False
    columnas: bool = False


_URGENCIAS = {normalizar(etiqueta): valor for valor, etiqueta in Urgencia.choices} | {
    normalizar(valor): valor for valor, _ in Urgencia.choices
} | {"urgente": Urgencia.CRITICA, "normal": Urgencia.MEDIA}


@dataclass
class FilaResuelta:
    entrada: FilaEntrada
    columna: Columna | None = None
    urgencia: str = Urgencia.MEDIA
    responsables: list = field(default_factory=list)
    etiquetas: list = field(default_factory=list)
    #: {"<id del campo>": valor} ya validado.
    campos: dict = field(default_factory=dict)
    #: Columna del archivo que se creará al importar (vista previa con `Crear`).
    columna_nueva: str | None = None
    #: Etiquetas del archivo que se crearán al importar (ídem).
    etiquetas_nuevas: list = field(default_factory=list)

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


def faltantes(tablero: Tablero, entradas: list[FilaEntrada]) -> dict[str, list[str]]:
    """Columnas y etiquetas que nombra el archivo y el tablero no tiene, sin
    repetir (con la grafía de su primera aparición) y en ese orden."""
    columnas = list(tablero.columnas.activas())
    por_nombre = {normalizar(c.nombre) for c in columnas}
    hay_final = any(c.es_final for c in columnas)
    etiquetas = {normalizar(e.nombre) for e in tablero.etiquetas.all()}
    nuevas_col: dict[str, str] = {}
    nuevas_et: dict[str, str] = {}
    for e in entradas:
        # Una tarea terminada (MS Project al 100 %) va a la columna final, no a la suya.
        if e.columna and not (e.completada and hay_final) and normalizar(e.columna) not in por_nombre:
            nuevas_col.setdefault(normalizar(e.columna), e.columna.strip())
        for nombre in e.etiquetas:
            if normalizar(nombre) not in etiquetas:
                nuevas_et.setdefault(normalizar(nombre), nombre.strip())
    return {"columnas": list(nuevas_col.values()), "etiquetas": list(nuevas_et.values())}


def resolver(tablero: Tablero, entradas: list[FilaEntrada], crear: Crear | None = None) -> list[FilaResuelta]:
    """`crear` (vista previa): lo que falta y se va a crear se muestra como
    nuevo en vez de caer en la primera columna o perderse. Lo que falta y no
    se crea no lleva aviso por fila: lo resume `faltantes`."""
    crear = crear or Crear()
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

    etiquetas = {normalizar(e.nombre): e for e in tablero.etiquetas.all()}
    campos = {normalizar(c.nombre): c for c in tablero.campos.filter(archivado=False)}
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
            if r.columna is None and crear.columnas:
                r.columna_nueva = e.columna.strip()
        if r.columna_nueva is None:
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

        for nombre in e.etiquetas:
            etiqueta = etiquetas.get(normalizar(nombre))
            if etiqueta is None:
                if crear.etiquetas and nombre.strip() not in r.etiquetas_nuevas:
                    r.etiquetas_nuevas.append(nombre.strip())
            elif etiqueta not in r.etiquetas:
                r.etiquetas.append(etiqueta)

        for nombre, valor in e.campos.items():
            campo = campos.get(normalizar(nombre))
            if campo is None:
                continue  # columna que el tablero no conoce: se ignora
            try:
                normalizado = valor_valido(campo, valor)
            except ReglaDeNegocio as exc:
                e.avisos.append(f"{exc} Se deja vacío.")
                continue
            if normalizado is not None:
                r.campos[str(campo.pk)] = normalizado
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
        "columna": r.columna.nombre if r.columna else r.columna_nueva,
        "columna_nueva": r.columna_nueva is not None,
        "urgencia": r.urgencia,
        "inicio": e.inicio.isoformat() if e.inicio else None,
        "fin": e.fin.isoformat() if e.fin else None,
        "responsables": [nombre_persona(p) for p in r.responsables],
        "etiquetas": [et.nombre for et in r.etiquetas] + r.etiquetas_nuevas,
        "etiquetas_nuevas": r.etiquetas_nuevas,
        "depende": [referencia_texto(ref, tipo, d) for ref, tipo, d in e.depende],
        "errores": e.errores,
        "avisos": e.avisos,
    }


def _problemas(tablero: Tablero, falta: dict, crear: Crear) -> list[str]:
    """Lo que impediría importar tal como se pide (no depende de una fila)."""
    cupo = MAX_ETIQUETAS - tablero.etiquetas.count()
    if crear.etiquetas and len(falta["etiquetas"]) > cupo:
        return [
            f"El archivo usa {len(falta['etiquetas'])} etiquetas nuevas y a este tablero le caben "
            f"{max(cupo, 0)} más (máximo {MAX_ETIQUETAS}). Quita etiquetas del archivo o no las crees."
        ]
    return []


def vista_previa(
    tablero: Tablero, nombre: str, contenido: bytes, *, crear: Crear | None = None, puede_crear: bool = False
) -> dict:
    crear = crear or Crear()
    entradas = leer_archivo(nombre, contenido)
    falta = faltantes(tablero, entradas)
    resueltas = resolver(tablero, entradas, crear)
    validas = [r for r in resueltas if r.valida]
    return {
        "filas": [_serializar(r) for r in resueltas],
        "total": len(resueltas),
        "validas": len(validas),
        "con_errores": len(resueltas) - len(validas),
        "dependencias": sum(len(r.entrada.depende) for r in validas),
        # Adónde van las tarjetas cuyas columnas no se crean: la primera.
        "faltantes": {**falta, "primera_columna": tablero.columnas.activas().first().nombre},
        "puede_crear": puede_crear,
        "problemas": _problemas(tablero, falta, crear),
    }


def _crear_faltantes(tablero: Tablero, entradas: list[FilaEntrada], crear: Crear) -> dict[str, list[str]]:
    """Crea lo que falta (dentro de la transacción de `importar`)."""
    falta = faltantes(tablero, entradas)
    problemas = _problemas(tablero, falta, crear)
    if problemas:
        raise ReglaDeNegocio(problemas[0])
    creadas: dict[str, list[str]] = {"columnas": [], "etiquetas": []}
    if crear.columnas and falta["columnas"]:
        existentes = list(tablero.columnas.activas())
        nuevas = [crear_columna(tablero, nombre=nombre) for nombre in falta["columnas"]]
        # Antes de la columna final (al final si no hay), en el orden del archivo.
        corte = next((i for i, c in enumerate(existentes) if c.es_final), len(existentes))
        orden = existentes[:corte] + nuevas + existentes[corte:]
        reordenar_columnas(tablero, ids=[c.pk for c in orden])
        creadas["columnas"] = [c.nombre for c in nuevas]
    if crear.etiquetas and falta["etiquetas"]:
        usados = set(tablero.etiquetas.values_list("color", flat=True))
        libres = [c for c in COLORES_ETIQUETA if c not in usados] or COLORES_ETIQUETA
        for i, nombre in enumerate(falta["etiquetas"]):
            etiqueta = crear_etiqueta(tablero, nombre=nombre[:40], color=libres[i % len(libres)])
            creadas["etiquetas"].append(etiqueta.nombre)
    return creadas


def importar(tablero: Tablero, nombre: str, contenido: bytes, *, actor, crear: Crear | None = None) -> dict:
    """`crear`: columnas y etiquetas que faltan (quien llama ya comprobó que
    `actor` gestiona el tablero). Si algo falla, no queda nada creado."""
    entradas = leer_archivo(nombre, contenido)
    creadas: dict[int, object] = {}  # «#» del archivo → tarjeta nueva
    por_persona: dict[int, list] = defaultdict(list)
    personas: dict[int, object] = {}
    omitidas_dep: list[str] = []
    with transaction.atomic():
        nuevas = _crear_faltantes(tablero, entradas, crear or Crear())
        resueltas = resolver(tablero, entradas)
        validas = [r for r in resueltas if r.valida]
        if not validas:
            raise ReglaDeNegocio("Ninguna fila se puede importar: revisa los errores de la vista previa.")
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
                etiquetas=r.etiquetas,
                valores_campos=r.campos,
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
        "columnas_creadas": nuevas["columnas"],
        "etiquetas_creadas": nuevas["etiquetas"],
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
