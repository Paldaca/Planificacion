"""Utilidades de la capa API compartidas por todas las apps."""

from rest_framework import serializers
from rest_framework.exceptions import ValidationError


def booleano(request, campo: str, defecto: bool) -> bool:
    """Lee un booleano del cuerpo sin la trampa de `bool("false") is True`."""
    if campo not in request.data:
        return defecto
    try:
        return serializers.BooleanField().to_internal_value(request.data[campo])
    except serializers.ValidationError:
        raise ValidationError({campo: "Debe ser verdadero o falso."})
