"""
Cliente del bus de notificaciones del Portal (campana).

Firma HMAC con el secreto PROPIO del módulo (`PALDACA_NOTIF_SECRET`, que debe
coincidir con `PALDACA_NOTIF_SECRET_PLANIFICACION` en el Portal). Misma
función que `Portal-Paldaca/backend/notificaciones/firma.py` (RN-31): si
cambia allí, cambia aquí — el vector de prueba compartido lo vigila
(`tests/test_notificaciones.py`).

Por qué firma y no la cookie del operador: el Portal solo acepta la cookie si
quien opera es administrador del módulo, y en Planificación avisa cualquier
miembro (o un cron, que no tiene operador). Y por qué no el esquema legado
(derivado de `DJANGO_SECRET_KEY`): la clave de este satélite es propia
(contrato federado R-02), así que el Portal nunca validaría esa firma. Sin
secreto propio configurado, no se encola nada y queda registrado.

Entrega fiable (docs/plan-modulo-planificacion.md §6.3):
- `emitir`/`resolver` guardan un `AvisoSaliente` en la transacción del cambio
  y lo envían tras el commit, fuera de la petición.
- Si falla por red, 5xx o credenciales, queda pendiente y
  `manage.py procesar_avisos` lo reintenta con espera creciente; un 400/404
  (tipo inexistente o inactivo, datos inválidos) se descarta: reintentar no
  lo arreglaría. La firma se calcula al enviar (ventana de ±5 min del Portal).
- Los avisos con la misma `clave_agrupacion` se envían en orden: un
  "resolver" nunca adelanta al "emitir" que resuelve.
- Destinatarios en ids del PORTAL (`CuentaPortal.portal_user_id`); nunca el
  actor; quien no tenga cuenta espejo activa se omite.
"""

from __future__ import annotations

import datetime
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
from django.core.cache import cache
from django.db import close_old_connections, transaction
from django.utils import timezone

from paldaca_sso import conf

from .models import AvisoSaliente

logger = logging.getLogger("planificacion.notificaciones")

TIMEOUT_SEGUNDOS = 4
LONGITUD_MINIMA_SECRETO = 32
MAX_INTENTOS = 10
_SAL = b"paldaca.notificaciones.v1:"

# Catálogo (los tipos se crean con migraciones en el Portal, nunca desde aquí).
INVITACION_EQUIPO = "planificacion.invitacion_equipo"
INVITACION_RESPONDIDA = "planificacion.invitacion_respondida"
CARD_ASIGNADA = "planificacion.card_asignada"
MENCION = "planificacion.mencion"
COMENTARIO_NUEVO = "planificacion.comentario_nuevo"
CARD_POR_VENCER = "planificacion.card_por_vencer"
CARD_VENCIDA = "planificacion.card_vencida"

_RUTAS = {
    AvisoSaliente.Tipo.EMITIR: "/api/notificaciones/eventos/",
    AvisoSaliente.Tipo.RESOLVER: "/api/notificaciones/eventos/resolver/",
}


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


# --- Encolar ------------------------------------------------------------------


def _encolar(tipo: str, codigo: str, datos: dict, clave: str) -> None:
    if not activas():
        return
    if not secreto_propio():
        logger.warning(
            "NOTIFICACION_SIN_SECRETO | %s: falta PALDACA_NOTIF_SECRET (>= %s caracteres)",
            codigo,
            LONGITUD_MINIMA_SECRETO,
        )
        return
    aviso = AvisoSaliente.objects.create(tipo=tipo, codigo=codigo, datos=datos, clave_agrupacion=clave)
    transaction.on_commit(lambda: _despachar(aviso.pk))


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
    """Encola un aviso para después del commit. Nunca lanza."""
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

        emisor = CuentaPortal.objects.filter(usuario_id=actor.pk).values_list("portal_user_id", flat=True).first()
        if emisor:
            datos["emisor_id"] = emisor
    if clave_agrupacion:
        datos["clave_agrupacion"] = clave_agrupacion[:120]
    _encolar(AvisoSaliente.Tipo.EMITIR, codigo, datos, clave_agrupacion[:120])


def resolver(*, codigo: str, clave_agrupacion: str) -> None:
    """Encola la resolución del aviso vivo (p. ej. invitación respondida). Nunca lanza."""
    datos = {"codigo": codigo, "clave_agrupacion": clave_agrupacion[:120]}
    _encolar(AvisoSaliente.Tipo.RESOLVER, codigo, datos, clave_agrupacion[:120])


# --- Enviar ---------------------------------------------------------------------


def _despachar(aviso_id: int) -> None:
    if getattr(settings, "PALDACA_NOTIF_ASINCRONO", True):
        threading.Thread(target=_enviar_en_hilo, args=(aviso_id,), daemon=True).start()
    else:
        enviar(aviso_id)


def _enviar_en_hilo(aviso_id: int) -> None:
    try:
        enviar(aviso_id)
    except Exception:  # un hilo de fondo nunca debe romper nada
        logger.exception("NOTIFICACION_HILO_FALLO | aviso=%s", aviso_id)
    finally:
        close_old_connections()


def _espera(intentos: int) -> datetime.timedelta:
    """1, 2, 4, 8… minutos, con techo de 6 horas."""
    return datetime.timedelta(minutes=min(2 ** max(intentos - 1, 0), 360))


def _post(ruta: str, datos: dict, secreto: str) -> tuple[bool, bool, str]:
    """(enviado, reintentable, error)."""
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
            return True, False, ""
    except urllib.error.HTTPError as exc:
        detalle = exc.read()[:200].decode("utf-8", "replace")
        # 400/404: tipo inexistente o inactivo, datos inválidos -> no se arregla solo.
        return False, exc.code not in (400, 404), f"HTTP {exc.code}: {detalle}"
    except Exception as exc:  # red, DNS, timeout: el Portal no está
        return False, True, str(exc)[:200]


RESERVA = datetime.timedelta(minutes=2)


def enviar(aviso_id: int) -> bool:
    """Intenta enviar un aviso pendiente. Devuelve True si quedó enviado.

    Sin transacción abierta durante la llamada HTTP (hasta 4 s): primero se
    RESERVA el aviso con un único UPDATE condicional (si otro proceso lo tomó,
    no hace nada), luego se llama al Portal y al final se guarda el resultado.
    """
    ahora = timezone.now()
    aviso = AvisoSaliente.objects.filter(pk=aviso_id).first()
    if aviso is None or aviso.estado != AvisoSaliente.Estado.PENDIENTE:
        return False
    if aviso.clave_agrupacion and AvisoSaliente.objects.filter(
        clave_agrupacion=aviso.clave_agrupacion,
        estado=AvisoSaliente.Estado.PENDIENTE,
        pk__lt=aviso.pk,
    ).exists():
        return False  # espera a que salga el anterior de la misma clave
    secreto = secreto_propio()
    if not secreto:
        AvisoSaliente.objects.filter(pk=aviso.pk).update(ultimo_error="Falta PALDACA_NOTIF_SECRET")
        return False
    reservado = (
        AvisoSaliente.objects.filter(pk=aviso.pk, estado=AvisoSaliente.Estado.PENDIENTE)
        .exclude(proximo_intento__gt=ahora)
        .update(proximo_intento=ahora + RESERVA)
    )
    if not reservado:
        return False

    enviado, reintentable, error = _post(_RUTAS[aviso.tipo], aviso.datos, secreto)

    aviso.intentos += 1
    if enviado:
        aviso.estado = AvisoSaliente.Estado.ENVIADO
        aviso.enviado_en = timezone.now()
        aviso.proximo_intento = None
        aviso.ultimo_error = ""
        logger.info("NOTIFICACION_ENVIADA | %s %s", aviso.tipo, aviso.codigo)
    elif reintentable and aviso.intentos < MAX_INTENTOS:
        aviso.proximo_intento = timezone.now() + _espera(aviso.intentos)
        aviso.ultimo_error = error
        logger.warning("NOTIFICACION_REINTENTO | %s %s intento=%s %s", aviso.tipo, aviso.codigo, aviso.intentos, error)
    else:
        aviso.estado = AvisoSaliente.Estado.DESCARTADO
        aviso.proximo_intento = None
        aviso.ultimo_error = error
        logger.error("NOTIFICACION_DESCARTADA | %s %s %s", aviso.tipo, aviso.codigo, error)
    aviso.save(update_fields=["intentos", "estado", "enviado_en", "proximo_intento", "ultimo_error"])
    return enviado


def procesar_pendientes(limite: int = 200) -> dict:
    """Reintenta los pendientes cuyo turno llegó, en orden. Lo usa el cron."""
    ahora = timezone.now()
    ids = list(
        AvisoSaliente.objects.filter(estado=AvisoSaliente.Estado.PENDIENTE)
        .exclude(proximo_intento__gt=ahora)
        .order_by("id")
        .values_list("id", flat=True)[:limite]
    )
    enviados = sum(1 for aviso_id in ids if enviar(aviso_id))
    return {"revisados": len(ids), "enviados": enviados}


# --- Configuración de un tipo (umbral editable sin deploy desde el Portal) ------


TIMEOUT_CONFIG_SEGUNDOS = 2
CACHE_CONFIG_SEGUNDOS = 600
CACHE_FALLO_SEGUNDOS = 60


def config_tipo(codigo: str) -> dict | None:
    """`{codigo, activo, umbral_dias}` vía GET firmado, con caché de 10 min.

    None si no hay secreto o el Portal no responde: quien llama siempre tiene
    un valor por defecto local. Un fallo también se recuerda (60 s): con el
    Portal caído, ninguna petición debe pagar un timeout por esta consulta."""
    clave_cache = f"planificacion:tipo:{codigo}"
    en_cache = cache.get(clave_cache)
    if en_cache is not None:
        return en_cache or None
    secreto = secreto_propio()
    if not secreto or not activas():
        return None
    cliente = conf.modulo_codigo()
    timestamp = str(int(time.time()))
    peticion = urllib.request.Request(
        f"{conf.portal_api_url()}/api/notificaciones/tipos/{codigo}/config/",
        method="GET",
        headers={
            "X-Paldaca-Client": cliente,
            "X-Paldaca-Timestamp": timestamp,
            "X-Paldaca-Signature": firmar(b"", cliente, timestamp, secreto),
        },
    )
    try:
        with urllib.request.urlopen(peticion, timeout=TIMEOUT_CONFIG_SEGUNDOS) as respuesta:
            datos = json.loads(respuesta.read())
    except Exception as exc:
        logger.warning("CONFIG_TIPO_NO_DISPONIBLE | %s %s", codigo, exc)
        datos = None
    if not isinstance(datos, dict):
        cache.set(clave_cache, {}, CACHE_FALLO_SEGUNDOS)
        return None
    cache.set(clave_cache, datos, CACHE_CONFIG_SEGUNDOS)
    return datos
