"""API de exportación e importación (`/api/v1/`)."""

from __future__ import annotations

from urllib.parse import quote

from django.http import HttpResponse
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import booleano
from core.errores import ReglaDeNegocio
from exportacion.services import excel, importacion, mspdi, pdf
from exportacion.services.datos import Filtros, contenido, nombre_archivo
from tableros import permisos
from tableros.api.views.comunes import obtener_tablero

TIPOS = {
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", excel.exportar),
    "xml": ("application/xml", mspdi.exportar),
    "pdf": ("application/pdf", pdf.exportar),
}


def _descarga(datos: bytes, tipo: str, nombre: str) -> HttpResponse:
    respuesta = HttpResponse(datos, content_type=tipo)
    respuesta["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(nombre)}"
    respuesta["Cache-Control"] = "no-store"
    return respuesta


class ExportarView(APIView):
    """`?formato=xlsx|xml|pdf` y los mismos filtros del tablero
    (`q`, `urgencia`, `responsable`, `etiqueta`, `vencidas`). El PDF (el Gantt)
    lleva además su configuración: `escala`, `zoom`, `agrupar`, `plegado`,
    `desde`/`hasta` y `hoja` (ver `pdf.OpcionesPdf`)."""

    def get(self, request, pk):
        tablero = obtener_tablero(request, pk)
        formato = request.query_params.get("formato", "xlsx")
        if formato not in TIPOS:
            raise ValidationError({"formato": "Usa xlsx (Excel), xml (MS Project) o pdf (Gantt)."})
        tipo, generar = TIPOS[formato]
        datos_tablero = contenido(tablero, Filtros.desde_query(request.query_params))
        if formato == "pdf":
            datos = pdf.exportar(datos_tablero, pdf.OpcionesPdf.desde_query(request.query_params))
            return _descarga(datos, tipo, f"gantt-{nombre_archivo(tablero, formato)}")
        return _descarga(generar(datos_tablero), tipo, nombre_archivo(tablero, formato))


class PlantillaView(APIView):
    def get(self, request, pk):
        tablero = obtener_tablero(request, pk)
        datos = excel.plantilla(
            [c.nombre for c in tablero.columnas.activas()], list(tablero.campos.filter(archivado=False))
        )
        return _descarga(datos, TIPOS["xlsx"][0], f"plantilla-{nombre_archivo(tablero, 'xlsx')}")


class ImportarView(APIView):
    """Multipart con `archivo`. Sin `confirmar`: vista previa (nada se guarda).
    Con `confirmar=true`: crea las filas válidas y sus dependencias.
    `crear_columnas` / `crear_etiquetas`: crear las que el archivo nombra y el
    tablero no tiene (solo quien gestiona el tablero)."""

    parser_classes = [MultiPartParser]

    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, editar=True)
        archivo = request.FILES.get("archivo")
        if archivo is None:
            raise ValidationError({"archivo": "Adjunta un Excel (.xlsx) o un XML de MS Project."})
        if archivo.size > importacion.MAX_BYTES:
            raise ReglaDeNegocio("El archivo supera los 5 MB.")
        datos = archivo.read()
        puede_crear = permisos.puede_gestionar_tablero(request.user, tablero)
        crear = importacion.Crear(
            etiquetas=booleano(request, "crear_etiquetas", False),
            columnas=booleano(request, "crear_columnas", False),
        )
        if (crear.etiquetas or crear.columnas) and not puede_crear:
            raise PermissionDenied("Solo quien gestiona el tablero puede crear columnas y etiquetas.")
        if booleano(request, "confirmar", False):
            resultado = importacion.importar(tablero, archivo.name, datos, actor=request.user, crear=crear)
            return Response(resultado, status=status.HTTP_201_CREATED)
        return Response(importacion.vista_previa(tablero, archivo.name, datos, crear=crear, puede_crear=puede_crear))
