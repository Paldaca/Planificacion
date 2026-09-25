"""
A quién se puede invitar (docs/plan-modulo-planificacion.md §6.2).

Fuente principal: el Portal, con TODAS las personas que tienen el módulo
asignado (`integracion_portal.services.directorio`). Si el Portal no responde,
cae a quienes ya entraron alguna vez al módulo (`fuente = "local"`).

Reciben la `request` porque el directorio del Portal se consulta con la
cookie de sesión de quien busca (sus permisos, no los del módulo).
"""

from __future__ import annotations

from core.errores import ServicioNoDisponible
from equipos.models import Equipo, EstadoInvitacion, InvitacionEquipo, MiembroEquipo
from integracion_portal.services import directorio
from integracion_portal.services.personas import buscar, persona, usuarios_del_modulo
from paldaca_sso.models import CuentaPortal

MAX_RESULTADOS = 10
MIN_CONSULTA = directorio.MIN_CONSULTA


def ocupados_en(equipo: Equipo) -> set[int]:
    """Miembros e invitados pendientes: no tiene sentido volver a invitarles."""
    miembros = MiembroEquipo.objects.filter(equipo=equipo).values_list("usuario_id", flat=True)
    pendientes = InvitacionEquipo.objects.filter(equipo=equipo, estado=EstadoInvitacion.PENDIENTE).values_list(
        "invitado_id", flat=True
    )
    return set(miembros) | set(pendientes)


def buscar_candidatos(request, q: str, *, excluidos: set[int]) -> dict:
    """{"resultados": [persona...], "fuente": "portal" | "local"}."""
    if len(q) < MIN_CONSULTA:
        return {"resultados": [], "fuente": "portal"}
    try:
        encontrados = directorio.buscar(request, q)
    except directorio.DirectorioNoDisponible:
        locales = buscar(q).exclude(pk__in=excluidos)[:MAX_RESULTADOS]
        return {"resultados": [persona(u) for u in locales], "fuente": "local"}

    cuentas = {
        c.portal_user_id: c.usuario
        for c in CuentaPortal.objects.select_related("usuario").filter(
            portal_user_id__in=[d["id"] for d in encontrados]
        )
    }
    resultados = []
    for datos in encontrados:
        local = cuentas.get(datos["id"])
        if local is not None and local.pk in excluidos:
            continue
        resultados.append(directorio.persona_desde_portal(datos, local))
    return {"resultados": resultados[:MAX_RESULTADOS], "fuente": "portal"}


def resolver_invitado(request, *, usuario_id: int | None = None, portal_id: int | None = None):
    """Usuario local a invitar, o None si no tiene acceso a Planificación.

    Por `portal_id` (resultado del buscador del Portal) se confirma SIEMPRE
    contra el Portal antes de crear nada; por `usuario_id` basta con que la
    cuenta espejo tenga el módulo."""
    if usuario_id is not None:
        return usuarios_del_modulo().filter(pk=usuario_id).first()
    if not directorio.cookie_portal(request):
        return usuarios_del_modulo().filter(cuenta_portal__portal_user_id=portal_id).first()
    try:
        confirmado = directorio.confirmar(request, portal_id)
    except directorio.DirectorioNoDisponible:
        raise ServicioNoDisponible(
            "No se pudo confirmar a esa persona con el Portal. Intenta de nuevo en un momento."
        )
    if confirmado is None:
        return None
    return directorio.cuenta_local(confirmado)
