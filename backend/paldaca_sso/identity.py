"""
Parseo del payload de `GET /api/auth/me/` del Portal a un objeto validado.

Ver `_user_payload()` en `Portal-Paldaca/backend/core/views_auth.py` para el
contrato exacto (documentado en `IA_CONTEXT.md` §11 C-03). Deliberadamente se
lee `modulos`, no `permisos`: `permisos` históricamente estuvo limitado a una
tupla hardcodeada que no necesariamente incluye módulos nuevos; `modulos` sale
de `modulos_habilitados()` sin ese filtro.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .exceptions import PortalUnavailable


@dataclass(frozen=True)
class Identity:
    portal_user_id: int
    email: str
    username: str
    first_name: str
    last_name: str
    rol: str
    es_superadmin: bool
    es_administrador: bool
    disciplina_nombre: str | None
    perfil_nombre: str | None
    modulos: tuple[dict, ...] = field(default_factory=tuple)
    raw: dict = field(default_factory=dict)

    @property
    def modulo_codigos(self) -> tuple[str, ...]:
        return tuple(m["codigo"] for m in self.modulos)

    def tiene_modulo(self, codigo: str) -> bool:
        # En el Portal, es_superadmin = acceso a todos los módulos activos.
        if self.es_superadmin:
            return True
        return codigo in self.modulo_codigos


def parse_payload(data) -> Identity:
    """
    Valida la forma mínima del payload y lo normaliza a `Identity`.

    Cualquier desviación de la forma esperada (falta `id`, `modulos` no es
    lista, etc.) se trata como `PortalUnavailable`, NUNCA como "usuario
    inválido": un payload deforme casi siempre significa que el Portal
    devolvió un error disfrazado de 200, no que el usuario no exista.
    """
    if not isinstance(data, dict):
        raise PortalUnavailable("El payload de /api/auth/me/ no es un objeto JSON")

    portal_user_id = data.get("id")
    if not isinstance(portal_user_id, int):
        raise PortalUnavailable("El payload de /api/auth/me/ no trae 'id' entero")

    modulos_raw = data.get("modulos")
    if not isinstance(modulos_raw, list):
        raise PortalUnavailable("El payload de /api/auth/me/ no trae 'modulos' como lista")

    modulos = tuple(
        sorted(
            (
                {"codigo": m["codigo"], "nombre": m.get("nombre") or m["codigo"]}
                for m in modulos_raw
                if isinstance(m, dict) and m.get("codigo")
            ),
            key=lambda m: m["codigo"],
        )
    )

    disciplina = data.get("disciplina") or {}
    perfil = data.get("perfil") or {}

    return Identity(
        portal_user_id=portal_user_id,
        email=(data.get("email") or "").strip(),
        username=(data.get("username") or "").strip(),
        first_name=data.get("first_name") or "",
        last_name=data.get("last_name") or "",
        rol=data.get("rol") or "usuario",
        es_superadmin=bool(data.get("es_superadmin")),
        es_administrador=bool(data.get("es_administrador")),
        disciplina_nombre=(disciplina.get("nombre") if isinstance(disciplina, dict) else None),
        perfil_nombre=(perfil.get("nombre") if isinstance(perfil, dict) else None),
        modulos=modulos,
        raw=data,
    )
