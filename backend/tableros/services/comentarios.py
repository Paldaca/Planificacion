"""Comentarios de una tarjeta, con menciones `@usuario` y sus avisos."""

from __future__ import annotations

import re

from django.db import transaction
from django.utils import timezone

from tableros.models import Actividad, Card, Comentario

from . import actividad, avisos

_MENCION = re.compile(r"(?<![\w@.])@([\w.\-]+)")


def extraer_menciones(texto: str, personas) -> list:
    """Personas del tablero mencionadas como `@usuario` (sin repetir)."""
    por_usuario = {p.username.lower(): p for p in personas}
    vistos: dict[int, object] = {}
    for coincidencia in _MENCION.finditer(texto or ""):
        persona = por_usuario.get(coincidencia.group(1).rstrip(".").lower())
        if persona is not None:
            vistos.setdefault(persona.pk, persona)
    return list(vistos.values())


@transaction.atomic
def comentar(card: Card, *, autor, texto: str) -> Comentario:
    comentario = Comentario.objects.create(card=card, autor=autor, texto=texto)
    mencionados = extraer_menciones(texto, card.tablero.personas_asignables())
    comentario.menciones.set(mencionados)
    actividad.registrar(card, autor, Actividad.Accion.COMENTO)
    avisos.avisar_comentario(comentario, mencionados, autor)
    return comentario


@transaction.atomic
def editar_comentario(comentario: Comentario, *, texto: str, actor) -> Comentario:
    comentario.texto = texto
    comentario.editado_en = timezone.now()
    comentario.save(update_fields=["texto", "editado_en"])
    antes = set(comentario.menciones.values_list("pk", flat=True))
    mencionados = extraer_menciones(texto, comentario.card.tablero.personas_asignables())
    comentario.menciones.set(mencionados)
    # Al editar solo se avisa a quien se menciona por primera vez; el resto de
    # responsables ya recibió el comentario original.
    avisos.avisar_menciones(comentario, [u for u in mencionados if u.pk not in antes], actor)
    return comentario


def eliminar_comentario(comentario: Comentario) -> None:
    """Borrado suave: queda el hueco en la conversación («comentario eliminado»)."""
    comentario.eliminado = True
    comentario.save(update_fields=["eliminado"])
