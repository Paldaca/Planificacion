"""Roles que vienen del Portal (espejados en la cuenta local)."""


def es_admin_modulo(usuario) -> bool:
    """Administrador del módulo en el Portal (o superusuario local de emergencia)."""
    return bool(
        usuario
        and usuario.is_authenticated
        and (usuario.is_superuser or getattr(usuario, "es_administrador", False))
    )
