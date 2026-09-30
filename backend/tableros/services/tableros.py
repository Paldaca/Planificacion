"""Tableros: alta con columnas predeterminadas, tablero personal, edición y archivo."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction

from core.errores import ReglaDeNegocio
from tableros.models import COLUMNAS_PREDETERMINADAS, Columna, Tablero, TipoTablero

NOMBRE_TABLERO_PERSONAL = "Mi tablero"


MAX_ENTRADAS_AYUDA = 40


def limpiar_ayuda(dato) -> dict:
    """La guía del Centro de ayuda de un tablero (viene de su plantilla), solo
    como texto y con límites: {titulo, resumen, entradas: [{id, titulo,
    parrafos}]}. Lo que no tenga esa forma se descarta; sin entradas, `{}`."""
    if not isinstance(dato, dict):
        return {}

    def texto(valor, largo: int) -> str:
        return str(valor).strip()[:largo] if isinstance(valor, (str, int, float)) else ""

    entradas = []
    for i, entrada in enumerate(dato.get("entradas") or []):
        if not isinstance(entrada, dict):
            continue
        parrafos = [p for p in (texto(v, 2000) for v in (entrada.get("parrafos") or [])) if p][:30]
        titulo = texto(entrada.get("titulo"), 150)
        if titulo and parrafos:
            entradas.append({"id": texto(entrada.get("id"), 60) or f"e{i}", "titulo": titulo, "parrafos": parrafos})
    if not entradas:
        return {}
    return {
        "titulo": texto(dato.get("titulo"), 40) or "Guía del tablero",
        "resumen": texto(dato.get("resumen"), 1000),
        "entradas": entradas[:MAX_ENTRADAS_AYUDA],
    }


@transaction.atomic
def crear_tablero(
    *,
    nombre: str,
    creado_por,
    tipo: str,
    propietario=None,
    equipo=None,
    descripcion: str = "",
    columnas: list[dict] | None = None,
    ayuda: dict | None = None,
) -> Tablero:
    """Con `columnas` (p. ej. desde una plantilla: nombre, es_final,
    incluir_en_gantt, limite_cards) en vez de Tareas / En curso / Hecho, y con
    la `ayuda` (guía del Centro de ayuda) que traiga la plantilla."""
    tablero = Tablero.objects.create(
        nombre=nombre,
        descripcion=descripcion,
        ayuda=limpiar_ayuda(ayuda),
        tipo=tipo,
        propietario=propietario,
        equipo=equipo,
        creado_por=creado_por,
    )
    definicion = columnas or [{"nombre": n, "es_final": f} for n, f in COLUMNAS_PREDETERMINADAS]
    Columna.objects.bulk_create(
        [
            Columna(
                tablero=tablero,
                nombre=str(c["nombre"])[:60],
                orden=i,
                es_final=bool(c.get("es_final")),
                incluir_en_gantt=c.get("incluir_en_gantt", True),
                limite_cards=c.get("limite_cards"),
            )
            for i, c in enumerate(definicion)
        ]
    )
    return tablero


def personales_de(usuario):
    return Tablero.objects.filter(tipo=TipoTablero.PERSONAL, propietario=usuario)


def asegurar_tablero_personal(usuario) -> Tablero:
    """«Mi tablero» en el primer ingreso. Solo si nunca tuvo ninguno (aunque
    los haya archivado todos, no se le crea otro a sus espaldas)."""
    existente = personales_de(usuario).order_by("id").first()
    if existente:
        return existente
    with transaction.atomic():
        # Dos pestañas a la vez: el bloqueo del usuario hace que la segunda
        # espere y encuentre el tablero que creó la primera.
        get_user_model().objects.select_for_update().filter(pk=usuario.pk).first()
        existente = personales_de(usuario).order_by("id").first()
        if existente:
            return existente
        return crear_tablero(
            nombre=NOMBRE_TABLERO_PERSONAL,
            creado_por=usuario,
            tipo=TipoTablero.PERSONAL,
            propietario=usuario,
        )


def puede_archivar_personal(tablero: Tablero) -> bool:
    """Un tablero personal se archiva si a su dueño le queda otro activo."""
    return personales_de(tablero.propietario_id).filter(archivado=False).exclude(pk=tablero.pk).exists()


def editar_tablero(tablero: Tablero, **cambios) -> Tablero:
    """`cambios`: nombre, descripcion."""
    for campo in ("nombre", "descripcion"):
        if campo in cambios:
            setattr(tablero, campo, cambios[campo])
    tablero.save()
    return tablero


def archivar_tablero(tablero: Tablero, *, archivado: bool) -> Tablero:
    if archivado and tablero.es_personal and not puede_archivar_personal(tablero):
        raise ReglaDeNegocio("Es tu único tablero personal activo: crea otro antes de archivarlo.")
    tablero.archivado = archivado
    tablero.save(update_fields=["archivado", "actualizado_en"])
    return tablero
