"""Obtener un equipo comprobando el acceso (compartido con la API de tableros)."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from equipos import permisos
from equipos.models import Equipo


def obtener_equipo(request, pk, *, administrar=False) -> Equipo:
    equipo = get_object_or_404(Equipo, pk=pk)
    if not permisos.puede_ver_equipo(request.user, equipo):
        raise PermissionDenied("No perteneces a este equipo.")
    if administrar and not permisos.puede_administrar_equipo(request.user, equipo):
        raise PermissionDenied("Solo los administradores del equipo pueden hacer esto.")
    return equipo
