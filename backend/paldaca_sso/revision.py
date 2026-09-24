"""
Revisión local de una `Identity`, para saber si hace falta repetir el upsert.

Análoga a `UsuarioPaldaca.get_auth_revision()` del Portal, pero calculada
sobre el payload remoto en vez de sobre filas de BD local — aquí no hay
`disciplina_id`/`perfil_id` propios que comparar, porque el espacio de PKs de
Planificación es independiente del Portal (ver provisioning.py). Se compara por
nombre en su lugar.
"""

from __future__ import annotations

import hashlib

from .identity import Identity


def compute_revision(identity: Identity) -> str:
    raw = "|".join(
        [
            str(identity.portal_user_id),
            identity.rol,
            "1" if identity.es_superadmin else "0",
            "1" if identity.es_administrador else "0",
            identity.email.lower(),
            identity.first_name,
            identity.last_name,
            identity.disciplina_nombre or "",
            identity.perfil_nombre or "",
            ",".join(identity.modulo_codigos),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
