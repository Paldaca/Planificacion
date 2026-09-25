"""
Cliente del bus de notificaciones del Portal (campana).

Firma HMAC con el secreto PROPIO del módulo (`PALDACA_NOTIF_SECRET`, que debe
coincidir con `PALDACA_NOTIF_SECRET_PLANIFICACION` en el Portal). Misma
función que `Portal-Paldaca/backend/notificaciones/firma.py` (RN-31): si
cambia allí, cambia aquí — el vector de prueba compartido lo vigila
(`tests/test_notificaciones.py`).

Por qué firma y no la cookie del operador: el Portal solo acepta la cookie si
quien opera es administrador del módulo, y en Planificación invita cualquier
administrador de EQUIPO. Y por qué no el esquema legado (derivado de
`DJANGO_SECRET_KEY`): la clave de este satélite es propia (contrato federado
R-02), así que el Portal nunca validaría esa firma. Sin secreto propio
configurado, no se emite nada y queda registrado.

Reglas (docs/plan-modulo-planificacion.md §6.3):
- Destinatarios en ids del PORTAL (`CuentaPortal.portal_user_id`); quien no
  tenga cuenta espejo se omite.
- Nunca se avisa al actor.
- Se envía DESPUÉS del commit y fuera de la petición: si el Portal no responde,
  se registra y el cambio local no se revierte.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Iterable

from django.conf import settings
from django.db import transaction

from paldaca_sso import conf

logger = logging.getLogger("planificacion.notificaciones")

TIMEOUT_SEGUNDOS = 4
LONGITUD_MINIMA_SECRETO = 32
_SAL = b"paldaca.notificaciones.v1:"

# Catálogo de tipos (se crean con migraciones en el Portal, nunca desde aquí).
INVITACION_EQUIPO = "planificacion.invitacion_equipo"


def firmar(cuerpo: bytes, cliente: str, timestamp: str, secreto: str) -> str:
    clave = hashlib.sha256(_SAL + secreto.encode()).digest()
    mensaje = f"{timestamp}.{cliente}.".encode() + cuerpo
    return hmac.new(clave, mensaje, hashlib.sha256).hexdigest()


def secreto_propio() -> str:
    """Primer secreto de `PALDACA_NOTIF_SECRET` (admite varios para rotar)."""
    valor = (getattr(settings, "PALDACA_NOTIF_SECRET", "") or "").split(",")[0].strip()
    return valor if len(valor) >= LONGITUD_MINIMA_SECRETO else ""


def activas() -> bool:
    return bool(getattr(settings, "PALDACA_NOTIFICACIONES_ACTIVAS", True))


def url_en_portal(ruta: str) -> str:
    """Deep link del Portal hacia una ruta de la SPA (`/invitaciones`)."""
    shell = getattr(settings, "PALDACA_SHELL_PATH", "/planificacion").rstrip("/")
    ruta = ruta if ruta.startswith("/") else f"/{ruta}"
    return f"{conf.portal_url()}{shell}{ruta}"


def ids_portal(usuarios: Iterable, excluir=None) -> list[int]:
    """Traduce usuarios locales a ids del Portal, sin el actor ni duplicados."""
    from paldaca_sso.models import CuentaPortal

    excluir_id = getattr(excluir, "pk", excluir)
    locales = {getattr(u, "pk", u) for u in usuarios} - {excluir_id}
    if not locales:
        return []
    return sorted(
        CuentaPortal.objects.filter(usuario_id__in=locales, activo_en_portal=True).values_list(
            "portal_user_id", flat=True
        )
    )


def _post(ruta: str, datos: dict, etiqueta: str) -> bool:
    secreto = secreto_propio()
    if not secreto:
        logger.warning(
            "NOTIFICACION_SIN_SECRETO | %s: falta PALDACA_NOTIF_SECRET (>= %s caracteres)",
            etiqueta,
            LONGITUD_MINIMA_SECRETO,
        )
        return False
    cliente = conf.modulo_codigo()
    cuerpo = json.dumps(datos).encode()
    timestamp = str(int(time.time()))
    peticion = urllib.request.Request(
        f"{conf.portal_api_url()}{ruta}",
        data=cuerpo,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Paldaca-Client": cliente,
            "X-Paldaca-Timestamp": timestamp,
            "X-Paldaca-Signature": firmar(cuerpo, cliente, timestamp, secreto),
        },
    )
    try:
        with urllib.request.urlopen(peticion, timeout=TIMEOUT_SEGUNDOS):
            pass
    except urllib.error.HTTPError as exc:
        logger.warning(
            "NOTIFICACION_RECHAZADA | %s status=%s detalle=%s", etiqueta, exc.code, exc.read()[:300]
        )
        return False
    except Exception as exc:  # red, DNS, timeout: el Portal no está
        logger.warning("NOTIFICACION_NO_ENVIADA | %s error=%s", etiqueta, exc)
        return False
    logger.info("NOTIFICACION_ENVIADA | %s", etiqueta)
    return True


def _despachar(funcion, *args) -> None:
    """Tras el commit; en un hilo para no demorar la respuesta (timeout de 4 s)."""

    def enviar():
        if getattr(settings, "PALDACA_NOTIF_ASINCRONO", True):
            threading.Thread(target=funcion, args=args, daemon=True).start()
        else:
            funcion(*args)

    transaction.on_commit(enviar)


def emitir(
    *,
    codigo: str,
    titulo: str,
    cuerpo: str,
    destinatarios: Iterable,
    actor=None,
    ruta: str = "",
    clave_agrupacion: str = "",
) -> None:
    """Programa un aviso para después del commit. Nunca lanza."""
    if not activas():
        return
    usuario_ids = ids_portal(destinatarios, excluir=actor)
    if not usuario_ids:
        return
    payload: dict = {"usuario_ids": usuario_ids}
    if ruta:
        payload["url"] = url_en_portal(ruta)
    datos = {"codigo": codigo, "titulo": titulo[:200], "cuerpo": cuerpo[:1000], "payload": payload}
    if actor is not None:
        from paldaca_sso.models import CuentaPortal

        emisor = CuentaPortal.objects.filter(usuario_id=actor.pk).values_list(
            "portal_user_id", flat=True
        ).first()
        if emisor:
            datos["emisor_id"] = emisor
    if clave_agrupacion:
        datos["clave_agrupacion"] = clave_agrupacion[:120]
    _despachar(_post, "/api/notificaciones/eventos/", datos, codigo)


def resolver(*, codigo: str, clave_agrupacion: str) -> None:
    """Marca resuelto el aviso vivo (p. ej. invitación respondida). Nunca lanza."""
    if not activas():
        return
    datos = {"codigo": codigo, "clave_agrupacion": clave_agrupacion[:120]}
    _despachar(_post, "/api/notificaciones/eventos/resolver/", datos, f"resolver {codigo}")
