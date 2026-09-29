"""Favoritos: cada persona marca los tableros que usa más (solo los ve ella)."""

from __future__ import annotations

from tableros.models import Tablero, TableroFavorito


def marcar_favorito(tablero: Tablero, usuario, *, favorito: bool) -> bool:
    """Idempotente: marcar dos veces o quitar uno que no estaba no falla.
    Quien llama ya comprobó que `usuario` ve el tablero. Devuelve el estado."""
    if favorito:
        TableroFavorito.objects.get_or_create(tablero=tablero, usuario=usuario)
    else:
        TableroFavorito.objects.filter(tablero=tablero, usuario=usuario).delete()
    return favorito


def ids_favoritos(usuario) -> set[int]:
    return set(TableroFavorito.objects.filter(usuario=usuario).values_list("tablero_id", flat=True))
