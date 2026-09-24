"""
Upsert de la cuenta espejo local a partir de una `Identity` resuelta contra
el Portal. Ver `CONTRATO_SSO_FEDERADO.md` §5 ("Cuenta espejo: reglas de
seguridad") para el razonamiento completo detrás de cada decisión.
"""

from __future__ import annotations

import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from core.models import Disciplina, Modulo, Perfil, UsuarioModulo

from . import conf
from .identity import Identity
from .models import CuentaPortal
from .revision import compute_revision

logger = logging.getLogger("paldaca.auth")


def upsert_mirror_user(identity: Identity):
    """Crea o actualiza la cuenta local para `identity`. Devuelve el usuario."""
    with transaction.atomic():
        cuenta = (
            CuentaPortal.objects.select_for_update()
            .filter(portal_user_id=identity.portal_user_id)
            .first()
        )

        if cuenta is not None:
            usuario = cuenta.usuario
            created = False
        else:
            usuario = _find_adoptable_user(identity) if conf.adopt_local_users() else None
            created = usuario is None
            if usuario is None:
                usuario = get_user_model()()
                usuario.set_unusable_password()
            cuenta = CuentaPortal(
                usuario=usuario,
                portal_user_id=identity.portal_user_id,
                origen=CuentaPortal.ORIGEN_PORTAL,
            )

        revision = compute_revision(identity)
        if not created and cuenta.pk and cuenta.revision == revision:
            cuenta.ultima_sincronizacion = timezone.now()
            cuenta.activo_en_portal = True
            cuenta.save(update_fields=["ultima_sincronizacion", "activo_en_portal"])
            return usuario

        _apply_identity_to_user(usuario, identity, is_new=created)
        usuario.save()

        _sync_disciplina_perfil(usuario, identity)
        usuario.save()

        _sync_modulos(usuario, identity)

        cuenta.revision = revision
        cuenta.payload_snapshot = identity.raw
        cuenta.ultima_sincronizacion = timezone.now()
        cuenta.activo_en_portal = True
        cuenta.ultimo_error = ""
        cuenta.ultimo_error_en = None
        cuenta.save()

        logger.info(
            "SSO_MIRROR_UPSERT | portal_user_id=%r usuario_id=%r creado=%r",
            identity.portal_user_id,
            usuario.pk,
            created,
        )
        return usuario


def _find_adoptable_user(identity: Identity):
    """
    Busca un usuario LOCAL preexistente que corresponda a esta identidad,
    para no duplicarlo al primer login.

    Nunca adopta un `is_superuser` local: mezclar una cuenta de emergencia
    (break-glass) con un espejo del Portal violaría justo la separación que
    ese mecanismo existe para garantizar.
    """
    UserModel = get_user_model()

    candidates = []
    if identity.username:
        candidates.append(UserModel.objects.filter(username=identity.username).first())
    if identity.email:
        candidates.append(
            UserModel.objects.filter(email__iexact=identity.email).exclude(email="").first()
        )

    for candidato in candidates:
        if candidato is None:
            continue
        if candidato.is_superuser:
            continue
        if CuentaPortal.objects.filter(usuario=candidato).exists():
            continue
        return candidato
    return None


def _apply_identity_to_user(usuario, identity: Identity, *, is_new: bool) -> None:
    UserModel = type(usuario)

    if is_new:
        usuario.username = _unique_username(
            identity.username or identity.email.split("@")[0] or f"portal{identity.portal_user_id}",
            portal_user_id=identity.portal_user_id,
            model=UserModel,
        )

    usuario.email = identity.email
    usuario.first_name = identity.first_name
    usuario.last_name = identity.last_name

    rol = identity.rol if identity.rol in (usuario.ROL_USUARIO, usuario.ROL_ADMINISTRADOR) else usuario.ROL_USUARIO
    if identity.es_superadmin:
        # es_superadmin en el Portal = "todos los módulos". Se traduce a rol
        # administrador local + fila explícita en core_usuario_modulo (ver
        # _sync_modulos), NUNCA a is_superuser=True: eso regalaría acceso al
        # Django admin de Planificación y saltaría todos los mixins de permisos.
        rol = usuario.ROL_ADMINISTRADOR
    usuario.rol = rol

    usuario.is_active = True
    usuario.is_staff = False
    # is_superuser: nunca se toca desde aquí.


def _unique_username(desired: str, *, portal_user_id: int, model) -> str:
    if not model.objects.filter(username=desired).exists():
        return desired
    suffixed = f"{desired}.p{portal_user_id}"
    logger.warning(
        "SSO_MIRROR_USERNAME_COLISION | desired=%r portal_user_id=%r usado=%r",
        desired,
        portal_user_id,
        suffixed,
    )
    return suffixed


def _sync_disciplina_perfil(usuario, identity: Identity) -> None:
    if identity.disciplina_nombre:
        disciplina, _ = Disciplina.objects.get_or_create(nombre=identity.disciplina_nombre)
        usuario.disciplina = disciplina
    else:
        usuario.disciplina = None

    if identity.perfil_nombre:
        perfil, _ = Perfil.objects.get_or_create(nombre=identity.perfil_nombre)
        usuario.perfil = perfil
    else:
        usuario.perfil = None


def _sync_modulos(usuario, identity: Identity) -> None:
    """Misma forma que `superadmin_panel/services.py:sync_user_modules` del
    Portal (replace-all), pero dentro de la transacción atómica del upsert."""
    if identity.es_superadmin:
        modulos = list(Modulo.objects.filter(activo=True))
    else:
        modulos = []
        for entry in identity.modulos:
            modulo, modulo_creado = Modulo.objects.get_or_create(
                codigo=entry["codigo"],
                defaults={"nombre": entry["nombre"], "activo": True},
            )
            if not modulo_creado and not modulo.activo:
                modulo.activo = True
                modulo.save(update_fields=["activo"])
            modulos.append(modulo)

    UsuarioModulo.objects.filter(usuario=usuario).exclude(modulo__in=modulos).delete()
    existentes = set(
        UsuarioModulo.objects.filter(usuario=usuario).values_list("modulo_id", flat=True)
    )
    UsuarioModulo.objects.bulk_create(
        [UsuarioModulo(usuario=usuario, modulo=m) for m in modulos if m.id not in existentes]
    )
