"""
Personas del Portal con acceso a Planificación (para invitar a equipos).

Consulta `GET /api/auth/directorio/modulos/planificacion/personas/` del Portal
reenviando la cookie del Portal de QUIEN OPERA, igual que `/api/auth/me/`: el
satélite nunca actúa por su cuenta y solo ve lo que esa persona podría ver.
El Portal devuelve únicamente cuentas activas con el módulo asignado, en una
forma mínima (sin permisos ni otros módulos).

Si el Portal no responde, el buscador cae a las personas que ya entraron al
módulo (cuentas espejo locales) y lo indica con `fuente = "local"`.

Invitar a alguien que nunca entró exige crear antes su cuenta espejo. Solo se
hace con datos CONFIRMADOS por el Portal (`?id=`), nunca con lo que mande el
navegador, y con las mismas reglas del SSO (`paldaca_sso.provisioning`:
contraseña inutilizable, jamás `is_superuser`). La revisión queda vacía a
propósito: en su primer ingreso real el SSO sincroniza la identidad completa.
"""

from __future__ import annotations

import logging

import requests
from django.db import IntegrityError

from core.models import Modulo, UsuarioModulo
from paldaca_sso import client as sso_client
from paldaca_sso import conf
from paldaca_sso.identity import parse_payload
from paldaca_sso.models import CuentaPortal
from paldaca_sso.provisioning import upsert_mirror_user

logger = logging.getLogger("planificacion.directorio")

MIN_CONSULTA = 3  # la misma regla que el Portal (views_directorio.MIN_QUERY_LEN)


class DirectorioNoDisponible(Exception):
    """El Portal no respondió algo utilizable: se usa el respaldo local."""


def cookie_portal(request) -> str:
    return request.COOKIES.get(conf.portal_cookie_name(), "")


def _consultar(request, params: dict) -> list[dict]:
    cookie = cookie_portal(request)
    if not cookie:
        raise DirectorioNoDisponible("La petición no trae la cookie del Portal.")
    if sso_client._breaker_is_open():
        raise DirectorioNoDisponible("Circuito abierto: fallos recientes del Portal.")
    url = f"{conf.portal_api_url()}/api/auth/directorio/modulos/{conf.modulo_codigo()}/personas/"
    try:
        respuesta = sso_client._session.get(
            url,
            params=params,
            cookies={conf.portal_cookie_name(): cookie},
            headers={"Accept": "application/json", "X-Paldaca-Client": conf.modulo_codigo()},
            timeout=(conf.timeout_connect(), conf.timeout_read()),
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise DirectorioNoDisponible(f"Error de red hacia el Portal: {exc}") from exc

    if respuesta.status_code != 200 or "application/json" not in respuesta.headers.get("Content-Type", ""):
        logger.warning("DIRECTORIO_PORTAL_RECHAZO | status=%s", respuesta.status_code)
        raise DirectorioNoDisponible(f"El Portal respondió {respuesta.status_code}.")
    try:
        resultados = respuesta.json().get("resultados")
    except (ValueError, AttributeError) as exc:
        raise DirectorioNoDisponible("El Portal devolvió un JSON inválido.") from exc
    if not isinstance(resultados, list):
        raise DirectorioNoDisponible("El Portal no devolvió una lista de resultados.")
    return [r for r in resultados if isinstance(r, dict) and isinstance(r.get("id"), int)]


def buscar(request, q: str) -> list[dict]:
    return _consultar(request, {"q": q})


def confirmar(request, portal_id: int) -> dict | None:
    """Datos de `portal_id` si el Portal confirma que tiene el módulo; si no, None."""
    resultados = _consultar(request, {"id": portal_id})
    return next((r for r in resultados if r["id"] == portal_id), None)


def cuenta_local(datos: dict):
    """Usuario local para una persona confirmada por el Portal (la crea si falta)."""
    codigo = conf.modulo_codigo()
    cuenta = CuentaPortal.objects.select_related("usuario").filter(portal_user_id=datos["id"]).first()
    if cuenta is not None:
        usuario = cuenta.usuario
    else:
        modulo = Modulo.objects.filter(codigo=codigo).first()
        identidad = parse_payload(
            {
                **datos,
                "es_superadmin": False,
                "es_administrador": datos.get("rol") == "administrador",
                "modulos": [{"codigo": codigo, "nombre": modulo.nombre if modulo else codigo}],
            }
        )
        try:
            usuario = upsert_mirror_user(identidad)
        except IntegrityError:
            # Otra petición la creó en paralelo: se usa esa.
            usuario = CuentaPortal.objects.select_related("usuario").get(portal_user_id=datos["id"]).usuario
        else:
            # Vacía: fuerza la sincronización completa en su primer ingreso real.
            CuentaPortal.objects.filter(usuario=usuario).update(revision="")
            logger.info("DIRECTORIO_CUENTA_ANTICIPADA | portal_user_id=%r usuario_id=%r", datos["id"], usuario.pk)

    # El Portal acaba de confirmar el acceso: la fila local del módulo debe existir.
    modulo = Modulo.objects.filter(codigo=codigo, activo=True).first()
    if modulo is not None:
        UsuarioModulo.objects.get_or_create(usuario=usuario, modulo=modulo)
    return usuario


def persona_desde_portal(datos: dict, usuario_local=None) -> dict:
    """Misma forma que `personas.persona()`, más `portal_id`; `id` es el local o None."""
    nombre = f"{datos.get('first_name', '')} {datos.get('last_name', '')}".strip() or datos.get("username", "")
    partes = [p for p in (datos.get("first_name"), datos.get("last_name")) if p] or [datos.get("username") or "?"]
    disciplina = datos.get("disciplina")
    return {
        "id": usuario_local.pk if usuario_local else None,
        "portal_id": datos["id"],
        "nombre": nombre,
        "username": datos.get("username", ""),
        "email": datos.get("email", ""),
        "iniciales": "".join(p[0] for p in partes[:2]).upper(),
        "disciplina": disciplina.get("nombre") if isinstance(disciplina, dict) else None,
    }
