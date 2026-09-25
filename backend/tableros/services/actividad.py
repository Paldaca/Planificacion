"""Historial de una card (pestaña «Actividad» de la tarjeta abierta)."""

from __future__ import annotations

from integracion_portal.services.personas import nombre

from tableros.models import Actividad

# Campos cuyo antes/después se guarda tal cual. La descripción no: podría ser
# larga y ya se ve completa en la tarjeta; basta con saber que cambió.
CAMPOS_CON_VALOR = ("titulo", "fecha_inicio", "fecha_fin", "urgencia")


def registrar(card, actor, accion: str, **detalle) -> Actividad:
    return Actividad.objects.create(
        card=card,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        accion=accion,
        detalle=detalle,
    )


def registrar_ediciones(card, actor, antes: dict, despues: dict) -> None:
    for campo, valor_antes in antes.items():
        valor_despues = despues.get(campo)
        if valor_antes == valor_despues:
            continue
        if campo in CAMPOS_CON_VALOR:
            registrar(
                card,
                actor,
                Actividad.Accion.EDITO,
                campo=campo,
                antes=_texto(valor_antes),
                despues=_texto(valor_despues),
            )
        else:
            registrar(card, actor, Actividad.Accion.EDITO, campo=campo)


def registrar_responsables(card, actor, agregados, quitados) -> None:
    if agregados:
        registrar(card, actor, Actividad.Accion.ASIGNO, personas=[nombre(u) for u in agregados])
    if quitados:
        registrar(card, actor, Actividad.Accion.DESASIGNO, personas=[nombre(u) for u in quitados])


def _texto(valor):
    if valor is None:
        return None
    return valor.isoformat() if hasattr(valor, "isoformat") else str(valor)
