"""
Personas del módulo: quién existe para Planificación y cómo se presenta.

Fase 1 (docs/plan-modulo-planificacion.md §6.2): solo se conoce a quien ya
entró alguna vez al módulo (su cuenta espejo existe). Nombre, email y
disciplina se leen SIEMPRE de la cuenta espejo, nunca se copian a los modelos
de negocio: un cambio en el Portal aparece solo en el siguiente ingreso.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Q, QuerySet

from paldaca_sso import conf


def usuarios_del_modulo() -> QuerySet:
    """Cuentas activas con acceso a este módulo según el último espejo."""
    return (
        get_user_model()
        .objects.filter(
            is_active=True,
            accesos_modulo__modulo__codigo=conf.modulo_codigo(),
            accesos_modulo__modulo__activo=True,
        )
        .select_related("disciplina")
        .distinct()
    )


def buscar(q: str) -> QuerySet:
    """Sin cortar: quien llama excluye lo que necesite y luego limita."""
    qs = usuarios_del_modulo()
    for palabra in (q or "").split()[:5]:
        qs = qs.filter(
            Q(username__icontains=palabra)
            | Q(email__icontains=palabra)
            | Q(first_name__icontains=palabra)
            | Q(last_name__icontains=palabra)
        )
    return qs.order_by("first_name", "last_name", "username")


def nombre(usuario) -> str:
    completo = f"{usuario.first_name} {usuario.last_name}".strip()
    return completo or usuario.username


def iniciales(usuario) -> str:
    partes = [p for p in (usuario.first_name, usuario.last_name) if p]
    if not partes:
        partes = [usuario.username]
    letras = "".join(p[0] for p in partes[:2]).upper()
    return letras or "?"


def persona(usuario) -> dict | None:
    """Forma pública de una persona en la API."""
    if usuario is None:
        return None
    return {
        "id": usuario.pk,
        "nombre": nombre(usuario),
        "username": usuario.username,
        "email": usuario.email,
        "iniciales": iniciales(usuario),
        "disciplina": usuario.disciplina.nombre if getattr(usuario, "disciplina_id", None) else None,
    }
