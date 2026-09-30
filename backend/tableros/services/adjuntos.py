"""
Adjuntos de una tarjeta: archivos que acompañan a la descripción (el documento
de requisitos, un plano, una captura).

- El contenido se guarda **en la base** (decisión D-16 del plan): el despliegue
  no necesita un volumen persistente y el respaldo de la base incluye los
  archivos. A cambio el tamaño está acotado.
- Se sirven como descarga y con el tipo deducido del nombre: un HTML o un SVG
  subido no se ejecuta en el origen de la aplicación. La única excepción son
  las **imágenes de mapa de bits** (PNG, JPEG, GIF, WebP), que la tarjeta
  muestra en línea: su contenido se comprueba al subirlas y otra vez al
  servirlas (`se_puede_mostrar`).
- Un archivo que ya está adjunto a la tarjeta (mismo contenido, aunque se
  llame distinto) no se vuelve a guardar: elegirlo otra vez, soltar una
  miniatura sobre la tarjeta o pegar la misma captura lo duplicaría. Se
  compara la `huella` (SHA-256) de lo que se subió, no lo guardado: una
  imagen reducida ya no es igual a su original.
- Las **imágenes se reducen al subirlas** (`_preparar_imagen`): como mucho
  `LADO_MAXIMO` px de lado, y se guarda aparte una `miniatura` JPEG de
  `LADO_MINIATURA` px para la cuadrícula y la portada. Así ocupan menos en la
  base y abrir un tablero con portadas no descarga las imágenes completas.
- Quitar un adjunto lo borra de verdad (es la única forma de liberar el
  espacio); queda en el historial de la tarjeta quién lo quitó.
"""

from __future__ import annotations

import hashlib
import io
import mimetypes
import os
import re

from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError

from core.errores import ReglaDeNegocio
from tableros.models import TIPOS_IMAGEN, Actividad, Adjunto, Card

from . import actividad

MAX_BYTES = 10 * 1024 * 1024
MAX_POR_TARJETA = 20
#: Lo que se ejecuta con un doble clic: no se acepta como adjunto.
EXTENSIONES_BLOQUEADAS = frozenset(
    {".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".pif", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".ps1", ".sh", ".jar", ".dll", ".lnk", ".reg", ".hta"}
)
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")

#: Tipos de lo que más se adjunta, por extensión: `mimetypes` depende del
#: sistema (en Windows lee el registro; en la imagen de Docker no conoce .webp).
TIPOS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
TIPO_GENERICO = "application/octet-stream"
#: Imágenes que se muestran dentro de la tarjeta, con el comienzo que debe
#: tener su contenido. Sin SVG: es un documento que puede llevar scripts.
FIRMAS_IMAGEN = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "image/webp": (b"RIFF",),
}


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


def es_imagen(tipo: str) -> bool:
    """El tipo guardado es el de una imagen que la tarjeta muestra en línea
    (`TIPOS_IMAGEN` del modelo: las mismas de `FIRMAS_IMAGEN`)."""
    return tipo in TIPOS_IMAGEN


def se_puede_mostrar(tipo: str, contenido: bytes) -> bool:
    """Es una imagen de las permitidas **y** su contenido empieza como tal: un
    HTML llamado `foto.png` no se sirve en línea."""
    if tipo == "image/webp":
        return contenido[:4] == b"RIFF" and contenido[8:12] == b"WEBP"
    return any(contenido.startswith(firma) for firma in FIRMAS_IMAGEN.get(tipo, ()))


def _tipo_de(nombre: str, contenido: bytes) -> str:
    tipo = TIPOS.get(os.path.splitext(nombre)[1].lower()) or mimetypes.guess_type(nombre)[0] or TIPO_GENERICO
    # Dice ser una imagen y no lo es: se guarda, pero como un archivo cualquiera.
    if es_imagen(tipo) and not se_puede_mostrar(tipo, contenido):
        return TIPO_GENERICO
    return tipo


#: Lado mayor de una imagen guardada (Full HD): de sobra para verla en pantalla.
LADO_MAXIMO = 1920
#: Lado mayor de la miniatura (la portada mide ~250 px de ancho; el doble para pantallas densas).
LADO_MINIATURA = 480
#: Más píxeles que esto no se procesa: una imagen pequeña en bytes puede
#: descomprimirse en gigas de memoria («bomba» de descompresión).
MAX_PIXELES = 50_000_000
_FORMATO_PIL = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}


def _a_rgb(imagen: Image.Image) -> Image.Image:
    """Sin transparencia (JPEG no la admite): sobre fondo blanco."""
    if imagen.mode in ("RGBA", "LA") or (imagen.mode == "P" and "transparency" in imagen.info):
        fondo = Image.new("RGB", imagen.size, "white")
        rgba = imagen.convert("RGBA")
        fondo.paste(rgba, mask=rgba.getchannel("A"))
        return fondo
    return imagen.convert("RGB")


def _preparar_imagen(tipo: str, contenido: bytes) -> tuple[bytes, bytes | None]:
    """(contenido a guardar, miniatura JPEG). Reduce la imagen a `LADO_MAXIMO`
    en su mismo formato (y se queda con la original si reducirla no la hace
    más liviana); un GIF se guarda tal cual (puede ser animado). Si Pillow no
    la puede leer, se guarda sin tocar y sin miniatura."""
    try:
        with Image.open(io.BytesIO(contenido)) as abierta:
            ancho, alto = abierta.size
            if ancho * alto > MAX_PIXELES:
                raise ReglaDeNegocio("La imagen tiene demasiados píxeles para procesarla. Redúcela antes de adjuntarla.")
            imagen = ImageOps.exif_transpose(abierta)  # la foto del teléfono, derecha
            imagen.load()
    except ReglaDeNegocio:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return contenido, None

    guardado = contenido
    formato = _FORMATO_PIL.get(tipo)
    if formato and max(imagen.size) > LADO_MAXIMO:
        reducida = imagen.copy()
        reducida.thumbnail((LADO_MAXIMO, LADO_MAXIMO), Image.Resampling.LANCZOS)
        if formato == "JPEG":
            reducida = _a_rgb(reducida)
        salida = io.BytesIO()
        opciones = {"PNG": {"optimize": True}, "JPEG": {"quality": 85, "optimize": True}, "WEBP": {"quality": 85}}[formato]
        reducida.save(salida, formato, **opciones)
        if salida.tell() < len(contenido):
            guardado = salida.getvalue()

    mini = _a_rgb(imagen.copy())
    mini.thumbnail((LADO_MINIATURA, LADO_MINIATURA), Image.Resampling.LANCZOS)
    salida = io.BytesIO()
    mini.save(salida, "JPEG", quality=80, optimize=True)
    return guardado, salida.getvalue()


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
    contenido = archivo.read()
    huella = hashlib.sha256(contenido).hexdigest()
    repetido = card.adjuntos.filter(huella=huella).values_list("nombre", flat=True).first()
    if repetido is not None:
        raise ReglaDeNegocio(f"Ese archivo ya está adjunto a esta tarjeta («{repetido}»).")
    tipo = _tipo_de(nombre, contenido)
    miniatura = None
    if es_imagen(tipo):
        contenido, miniatura = _preparar_imagen(tipo, contenido)
    adjunto = Adjunto.objects.create(
        card=card,
        nombre=nombre,
        tipo=tipo,
        tamano=len(contenido),
        contenido=contenido,
        miniatura=miniatura,
        huella=huella,
        subido_por=actor,
    )
    actividad.registrar(card, actor, Actividad.Accion.ADJUNTO, cambio="agrego", nombre=nombre)
    return adjunto


@transaction.atomic
def quitar(adjunto: Adjunto, *, actor) -> None:
    actividad.registrar(adjunto.card, actor, Actividad.Accion.ADJUNTO, cambio="quito", nombre=adjunto.nombre)
    adjunto.delete()
