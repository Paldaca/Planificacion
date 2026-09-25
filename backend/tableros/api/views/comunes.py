"""Piezas compartidas por las vistas: contexto, acceso y respuesta 409."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from core.errores import ConflictoDeVersion
from tableros import permisos
from tableros.models import Card, Tablero
from tableros.services.vencimientos import umbral_por_vencer

from ..serializers import CardDetalleSerializer, TableroDetalleSerializer

SIN_ACCESO = "No tienes acceso a este tablero."
SIN_PERMISO_EDITAR = "Solo puedes consultar este tablero."
SIN_PERMISO_GESTIONAR = "Solo los administradores del equipo pueden cambiar esto."


def contexto(request) -> dict:
    return {"request": request, "hoy": timezone.localdate(), "umbral": umbral_por_vencer()}


def obtener_tablero(request, pk, *, editar=False, gestionar=False) -> Tablero:
    tablero = get_object_or_404(Tablero.objects.select_related("equipo", "propietario"), pk=pk)
    usuario = request.user
    if not permisos.puede_ver_tablero(usuario, tablero):
        raise PermissionDenied(SIN_ACCESO)
    if editar and not permisos.puede_editar_tablero(usuario, tablero):
        raise PermissionDenied(SIN_PERMISO_EDITAR)
    if gestionar and not permisos.puede_gestionar_tablero(usuario, tablero):
        raise PermissionDenied(SIN_PERMISO_GESTIONAR)
    return tablero


def obtener_card(request, pk, *, editar=False) -> Card:
    card = get_object_or_404(
        Card.objects.select_related("tablero__equipo", "tablero__propietario", "columna", "creada_por"),
        pk=pk,
    )
    obtener_tablero(request, card.tablero_id, editar=editar)
    return card


def detalle_tablero(request, tablero: Tablero) -> dict:
    tablero.columnas_activas = list(tablero.columnas.activas())
    tablero.cards_activas = list(tablero.cards.activas().con_detalle().order_by("orden", "id"))
    return TableroDetalleSerializer(tablero, context=contexto(request)).data


def detalle_card(request, card: Card) -> dict:
    card = Card.objects.filter(pk=card.pk).con_detalle().get()
    return CardDetalleSerializer(card, context=contexto(request)).data


def conflicto(exc: ConflictoDeVersion, datos_actuales: dict) -> Response:
    return Response({"detail": str(exc), "actual": datos_actuales}, status=status.HTTP_409_CONFLICT)
