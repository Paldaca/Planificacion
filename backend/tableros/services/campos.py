"""
Campos personalizados de un tablero (fase 5): texto, número o lista.

- Las definiciones son configuración del tablero (las gestiona su
  administrador); los valores viven en `Card.campos` ({"<id>": valor}).
- Un campo no se borra: se **archiva** y sus valores se conservan (se
  restauran al desarchivarlo).
- El tipo no cambia después de creado: los valores guardados dejarían de
  tener sentido.
- Renombrar una opción de una lista (`renombrar` en `editar_campo`) cambia
  también el valor de las tarjetas que la tenían; quitarla no: esas tarjetas
  conservan el valor hasta que se elija otro.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Max

from core.errores import ReglaDeNegocio
from core.texto import clave_nombre
from tableros.models import CampoPersonalizado, Card, Tablero, TipoCampo

MAX_CAMPOS = 20
MAX_OPCIONES = 30
MAX_TEXTO = 500


def _opciones_limpias(opciones) -> list[str]:
    limpias = list(dict.fromkeys(str(o).strip()[:60] for o in (opciones or []) if str(o).strip()))
    if not limpias:
        raise ReglaDeNegocio("Una lista necesita al menos una opción.")
    if len(limpias) > MAX_OPCIONES:
        raise ReglaDeNegocio(f"Una lista admite hasta {MAX_OPCIONES} opciones.")
    return limpias


def _guardar(campo: CampoPersonalizado) -> CampoPersonalizado:
    try:
        with transaction.atomic():
            # «Nombre único entre los activos» también se comprueba aquí: MySQL no
            # admite la restricción con condición (`campo_activo_unico_por_tablero`)
            # y la ignora. Con el tablero bloqueado, dos altas simultáneas no pasan
            # ambas. Sin mayúsculas ni acentos, como compara MySQL.
            if not campo.archivado:
                Tablero.objects.select_for_update().filter(pk=campo.tablero_id).first()
                activos = (
                    CampoPersonalizado.objects.filter(tablero_id=campo.tablero_id, archivado=False)
                    .exclude(pk=campo.pk)
                    .values_list("nombre", flat=True)
                )
                if any(clave_nombre(n) == clave_nombre(campo.nombre) for n in activos):
                    raise IntegrityError
            campo.save()
    except IntegrityError:
        raise ReglaDeNegocio(f"Ya hay un campo «{campo.nombre}» en este tablero.")
    return campo


@transaction.atomic
def crear_campo(
    tablero: Tablero,
    *,
    nombre: str,
    tipo: str,
    opciones=None,
    visible_en_tarjeta: bool = False,
    atajo_al_crear: bool = False,
) -> CampoPersonalizado:
    if not nombre or not nombre.strip():
        raise ReglaDeNegocio("Ponle un nombre al campo.")
    if tipo not in TipoCampo.values:
        raise ReglaDeNegocio("Tipo de campo inválido (texto, número o lista).")
    if tablero.campos.filter(archivado=False).count() >= MAX_CAMPOS:
        raise ReglaDeNegocio(f"Un tablero admite hasta {MAX_CAMPOS} campos.")
    campo = CampoPersonalizado(
        tablero=tablero,
        nombre=nombre.strip()[:60],
        tipo=tipo,
        opciones=_opciones_limpias(opciones) if tipo == TipoCampo.LISTA else [],
        orden=(tablero.campos.aggregate(m=Max("orden"))["m"] or 0) + 1,
        visible_en_tarjeta=visible_en_tarjeta,
        atajo_al_crear=atajo_al_crear and tipo == TipoCampo.LISTA,
    )
    return _guardar(campo)


def _renombrar_opciones(campo: CampoPersonalizado, renombrar: dict, anteriores: list[str]) -> None:
    """{opción vieja: nueva}: las tarjetas con la vieja pasan a la nueva. Es
    configuración del tablero (como borrar una etiqueta): sin historial por
    tarjeta."""
    cambios = {}
    for vieja, nueva in renombrar.items():
        nueva = str(nueva).strip()[:60]
        if vieja not in anteriores:
            raise ReglaDeNegocio(f"«{vieja}» no es una opción de «{campo.nombre}».")
        if nueva not in campo.opciones:
            raise ReglaDeNegocio(f"«{nueva}» no está entre las opciones nuevas de «{campo.nombre}».")
        if nueva != vieja:
            cambios[vieja] = nueva
    if not cambios:
        return
    clave = str(campo.pk)
    # En Python y no con un filtro JSON: una clave numérica se leería como índice de lista.
    tarjetas = [
        c
        for c in Card.objects.filter(tablero_id=campo.tablero_id).only("id", "campos")
        if (c.campos or {}).get(clave) in cambios
    ]
    for card in tarjetas:
        card.campos[clave] = cambios[card.campos[clave]]
    Card.objects.bulk_update(tarjetas, ["campos"])


@transaction.atomic
def editar_campo(campo: CampoPersonalizado, **cambios) -> CampoPersonalizado:
    """`cambios`: nombre, opciones (solo lista), renombrar ({opción vieja:
    nueva}, solo lista), visible_en_tarjeta, atajo_al_crear (solo lista), orden, archivado."""
    anteriores = list(campo.opciones)
    if "nombre" in cambios:
        if not cambios["nombre"].strip():
            raise ReglaDeNegocio("El nombre no puede quedar vacío.")
        campo.nombre = cambios["nombre"].strip()[:60]
    if "opciones" in cambios and campo.tipo == TipoCampo.LISTA:
        campo.opciones = _opciones_limpias(cambios["opciones"])
    if cambios.get("renombrar") and campo.tipo == TipoCampo.LISTA:
        _renombrar_opciones(campo, cambios["renombrar"], anteriores)
    if "atajo_al_crear" in cambios:
        campo.atajo_al_crear = bool(cambios["atajo_al_crear"]) and campo.tipo == TipoCampo.LISTA
    for atributo in ("visible_en_tarjeta", "orden", "archivado"):
        if atributo in cambios:
            setattr(campo, atributo, cambios[atributo])
    if not campo.archivado and campo.tablero.campos.filter(archivado=False).exclude(pk=campo.pk).count() >= MAX_CAMPOS:
        raise ReglaDeNegocio(f"Un tablero admite hasta {MAX_CAMPOS} campos activos.")
    return _guardar(campo)


def valor_valido(campo: CampoPersonalizado, valor):
    """Valor normalizado para guardar, o None para borrarlo. Lanza ReglaDeNegocio."""
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None
    if campo.tipo == TipoCampo.NUMERO:
        try:
            numero = Decimal(str(valor).strip().replace(",", "."))
        except InvalidOperation:
            raise ReglaDeNegocio(f"«{campo.nombre}» es un número: «{valor}» no lo es.")
        if not numero.is_finite() or abs(numero) >= Decimal("1e15"):
            raise ReglaDeNegocio(f"«{campo.nombre}»: número fuera de rango.")
        # Entero si no tiene decimales (JSON limpio); si no, float.
        return int(numero) if numero == numero.to_integral_value() else float(numero)
    texto = str(valor).strip()
    if campo.tipo == TipoCampo.LISTA:
        if texto not in campo.opciones:
            raise ReglaDeNegocio(f"«{texto}» no es una opción de «{campo.nombre}».")
        return texto
    return texto[:MAX_TEXTO]


def validar_valores(tablero: Tablero, valores: dict) -> dict[str, object]:
    """{id: valor} → {"<id>": valor normalizado | None}. Solo campos activos
    del tablero; None = borrar el valor."""
    if not isinstance(valores, dict):
        raise ReglaDeNegocio("Los campos se envían como {id: valor}.")
    campos = {str(c.pk): c for c in tablero.campos.filter(archivado=False)}
    resultado = {}
    for clave, valor in valores.items():
        campo = campos.get(str(clave))
        if campo is None:
            raise ReglaDeNegocio("Ese campo no existe en este tablero.")
        resultado[str(clave)] = valor_valido(campo, valor)
    return resultado


def texto_valor(valor) -> str:
    """Para el historial y los mensajes."""
    return "" if valor is None else str(valor)


def remapear(valores: dict, origen: Tablero, destino: Tablero) -> dict[str, object]:
    """Valores de una tarjeta que cambia de tablero: se conservan los campos
    que existen en el destino con el mismo nombre y tipo (y, en listas, con
    la misma opción); el resto se pierde."""
    de_origen = {str(c.pk): c for c in origen.campos.all()}
    por_nombre = {(c.nombre.lower(), c.tipo): c for c in destino.campos.filter(archivado=False)}
    resultado = {}
    for clave, valor in (valores or {}).items():
        campo = de_origen.get(clave)
        gemelo = por_nombre.get((campo.nombre.lower(), campo.tipo)) if campo else None
        if gemelo is None:
            continue
        try:
            resultado[str(gemelo.pk)] = valor_valido(gemelo, valor)
        except ReglaDeNegocio:
            continue
    return {k: v for k, v in resultado.items() if v is not None}
