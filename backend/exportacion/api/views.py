"""API de exportación e importación (`/api/v1/`)."""

from __future__ import annotations

from urllib.parse import quote

from django.http import HttpResponse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.api import booleano
from exportacion.services import excel, importacion, mspdi
from exportacion.services.datos import Filtros, contenido, nombre_archivo
from tableros.api.views.comunes import obtener_tablero

TIPOS = {
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", excel.exportar),
    "xml": ("application/xml", mspdi.exportar),
}


def _descarga(datos: bytes, tipo: str, nombre: str) -> HttpResponse:
    respuesta = HttpResponse(datos, content_type=tipo)
    respuesta["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(nombre)}"
    respuesta["Cache-Control"] = "no-store"
    return respuesta


class ExportarView(APIView):
    """`?formato=xlsx|xml` y los mismos filtros del tablero
    (`q`, `urgencia`, `responsable`, `vencidas`)."""

    def get(self, request, pk):
        tablero = obtener_tablero(request, pk)
        formato = request.query_params.get("formato", "xlsx")
        if formato not in TIPOS:
            raise ValidationError({"formato": "Usa xlsx (Excel) o xml (MS Project)."})
        tipo, generar = TIPOS[formato]
        datos = generar(contenido(tablero, Filtros.desde_query(request.query_params)))
        return _descarga(datos, tipo, nombre_archivo(tablero, formato))


class PlantillaView(APIView):
    def get(self, request, pk):
        tablero = obtener_tablero(request, pk)
        datos = excel.plantilla([c.nombre for c in tablero.columnas.activas()])
        return _descarga(datos, TIPOS["xlsx"][0], f"plantilla-{nombre_archivo(tablero, 'xlsx')}")


class ImportarView(APIView):
    """Multipart con `archivo`. Sin `confirmar`: vista previa (nada se guarda).
    Con `confirmar=true`: crea las filas válidas y sus dependencias."""

    parser_classes = [MultiPartParser]

    def post(self, request, pk):
        tablero = obtener_tablero(request, pk, editar=True)
        archivo = request.FILES.get("archivo")
        if archivo is None:
            raise ValidationError({"archivo": "Adjunta un Excel (.xlsx) o un XML de MS Project."})
        datos = archivo.read(importacion.MAX_BYTES + 1)
        if booleano(request, "confirmar", False):
            resultado = importacion.importar(tablero, archivo.name, datos, actor=request.user)
            return Response(resultado, status=status.HTTP_201_CREATED)
        return Response(importacion.vista_previa(tablero, archivo.name, datos))
