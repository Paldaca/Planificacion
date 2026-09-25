"""
Errores de dominio compartidos por todas las apps.

Los `services/` lanzan estas excepciones sin saber nada de HTTP; el manejador
de DRF (`manejador_excepciones`, registrado en settings) las traduce:
- `ReglaDeNegocio`             -> 400 {"detail": ...}
- `ServicioNoDisponible`       -> 503 {"detail": ...}
- `django...ValidationError`   -> 400 con el formato de DRF (viene de `full_clean`)
- `ConflictoDeVersion`         -> la atrapa la vista: responde 409 con el estado
                                  actual serializado con SU serializer.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.serializers import as_serializer_error
from rest_framework.views import exception_handler


class ErrorDeAplicacion(Exception):
    """Base de los errores propios (para distinguirlos de los de Python/Django)."""


class ReglaDeNegocio(ErrorDeAplicacion):
    """Operación válida en formato pero no permitida por las reglas."""


class ConflictoDeVersion(ErrorDeAplicacion):
    """Otra persona cambió el objeto: `actual` es su estado en la base."""

    def __init__(self, actual):
        super().__init__("Otra persona cambió esto mientras lo editabas. Se cargó la versión actual.")
        self.actual = actual


class ServicioNoDisponible(ErrorDeAplicacion):
    """Un sistema externo (el Portal) no respondió algo utilizable."""


def manejador_excepciones(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(as_serializer_error(exc))
    if isinstance(exc, ReglaDeNegocio):
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, ServicioNoDisponible):
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return exception_handler(exc, context)
