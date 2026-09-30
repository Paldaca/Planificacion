"""
Adjuntos de una tarjeta: archivos que acompañan a la descripción (el documento
de requisitos, un plano, una captura).

- El contenido se guarda **en la base** (decisión D-16 del plan): el despliegue
  no necesita un volumen persistente y el respaldo de la base incluye los
  archivos. A cambio el tamaño está acotado.
- Se sirven siempre como descarga (nunca en línea) y con el tipo deducido del
  nombre: un HTML o un SVG subido no se ejecuta en el origen de la aplicación.
- Quitar un adjunto lo borra de verdad (es la única forma de liberar el
  espacio); queda en el historial de la tarjeta quién lo quitó.
"""

from __future__ import annotations

import mimetypes
import os
import re

from django.db import transaction

from core.errores import ReglaDeNegocio
from tableros.models import Actividad, Adjunto, Card

from . import actividad

MAX_BYTES = 10 * 1024 * 1024
MAX_POR_TARJETA = 20
#: Lo que se ejecuta con un doble clic: no se acepta como adjunto.
EXTENSIONES_BLOQUEADAS = frozenset(
    {".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".pif", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".ps1", ".sh", ".jar", ".dll", ".lnk", ".reg", ".hta"}
)
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


#: Lo que una petición multipart añade al archivo (cabeceras y separadores).
MARGEN_PETICION = 64 * 1024


def _megas(numero_bytes: int) -> str:
    return f"{numero_bytes / (1024 * 1024):.0f} MB"


def _demasiado_grande() -> ReglaDeNegocio:
    return ReglaDeNegocio(f"El archivo pesa más de {_megas(MAX_BYTES)}. Súbelo a la carpeta del proyecto y pega el enlace.")


def comprobar_peticion(bytes_anunciados: int) -> None:
    """Antes de leer el cuerpo de la subida: Django escribe en el disco
    temporal todo archivo que llega, y el tamaño solo se conoce al final. Una
    petición que ya anuncia más de lo permitido se rechaza sin leerla."""
    if bytes_anunciados > MAX_BYTES + MARGEN_PETICION:
        raise _demasiado_grande()


def nombre_limpio(nombre: str) -> str:
    """Solo el nombre (sin carpetas ni caracteres de control), hasta 200."""
    base = os.path.basename((nombre or "").replace("\\", "/"))
    base = _CONTROL.sub("", base).strip()
    if len(base) > 200:
        raiz, extension = os.path.splitext(base)
        base = raiz[: 200 - len(extension)] + extension
    return base


@transaction.atomic
def adjuntar(card: Card, *, archivo, actor) -> Adjunto:
    """`archivo`: un `UploadedFile` de Django."""
    nombre = nombre_limpio(getattr(archivo, "name", ""))
    if not nombre:
        raise ReglaDeNegocio("El archivo no tiene nombre.")
    if os.path.splitext(nombre)[1].lower() in EXTENSIONES_BLOQUEADAS:
        raise ReglaDeNegocio("Ese tipo de archivo no se puede adjuntar (es un programa o un script).")
    if archivo.size == 0:
        raise ReglaDeNegocio("El archivo está vacío.")
    if archivo.size > MAX_BYTES:
        raise _demasiado_grande()
    # Con la tarjeta bloqueada: dos subidas a la vez no pasan el cupo.
    Card.objects.select_for_update().filter(pk=card.pk).first()
    if card.adjuntos.count() >= MAX_POR_TARJETA:
        raise ReglaDeNegocio(f"Una tarjeta admite hasta {MAX_POR_TARJETA} adjuntos.")
    adjunto = Adjunto.objects.create(
        card=card,
        nombre=nombre,
        tipo=mimetypes.guess_type(nombre)[0] or "application/octet-stream",
        tamano=archivo.size,
        contenido=archivo.read(),
        subido_por=actor,
    )
    actividad.registrar(card, actor, Actividad.Accion.ADJUNTO, cambio="agrego", nombre=nombre)
    return adjunto


@transaction.atomic
def quitar(adjunto: Adjunto, *, actor) -> None:
    actividad.registrar(adjunto.card, actor, Actividad.Accion.ADJUNTO, cambio="quito", nombre=adjunto.nombre)
    adjunto.delete()
