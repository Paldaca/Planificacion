"""
Esquema local de identidad de Planificación.

Planificación es un satélite FEDERADO (ver
`Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md`): tiene su propia
base de datos y su propio `AUTH_USER_MODEL`, independiente del `core_usuario`
del Portal. Estos modelos reproducen la FORMA del esquema de identidad del
Portal (mismos `db_table`, por legibilidad) pero viven en una base de datos
separada — no hay FK ni import real hacia el Portal. Se llenan vía sincronía
de `paldaca_sso.provisioning.upsert_mirror_user()`, nunca a mano.
"""

import hashlib

from django.contrib.auth.models import AbstractUser
from django.db import models


class Disciplina(models.Model):
    nombre = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "core_disciplina"
        ordering = ("nombre",)
        verbose_name = "Disciplina"
        verbose_name_plural = "Disciplinas"

    def __str__(self):
        return self.nombre


class Perfil(models.Model):
    nombre = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "core_perfil"
        ordering = ("nombre",)
        verbose_name = "Perfil"
        verbose_name_plural = "Perfiles"

    def __str__(self):
        return self.nombre


class Modulo(models.Model):
    codigo = models.SlugField(
        max_length=32,
        unique=True,
        help_text="Identificador estable del programa (ej. portal, planificacion).",
    )
    nombre = models.CharField(max_length=80)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "core_modulo"
        ordering = ("nombre",)
        verbose_name = "Módulo"
        verbose_name_plural = "Módulos"

    def __str__(self):
        return f"{self.nombre} ({self.codigo})"


class UsuarioModulo(models.Model):
    usuario = models.ForeignKey(
        "UsuarioPaldaca",
        on_delete=models.CASCADE,
        related_name="accesos_modulo",
    )
    modulo = models.ForeignKey(
        Modulo,
        on_delete=models.CASCADE,
        related_name="accesos_usuario",
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "core_usuario_modulo"
        constraints = [
            models.UniqueConstraint(
                fields=("usuario", "modulo"),
                name="core_usuario_modulo_unique",
            )
        ]
        verbose_name = "Acceso a módulo"
        verbose_name_plural = "Accesos a módulos"

    def __str__(self):
        return f"{self.usuario_id} -> {self.modulo.codigo}"


class UsuarioPaldaca(AbstractUser):
    ROL_USUARIO = "usuario"
    ROL_ADMINISTRADOR = "administrador"

    ROL_CHOICES = (
        (ROL_USUARIO, "Usuario"),
        (ROL_ADMINISTRADOR, "Administrador"),
    )

    disciplina = models.ForeignKey(
        Disciplina,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="usuarios",
    )
    perfil = models.ForeignKey(
        Perfil,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="usuarios",
    )
    rol = models.CharField(max_length=20, choices=ROL_CHOICES, default=ROL_USUARIO)
    modulos = models.ManyToManyField(
        Modulo,
        through=UsuarioModulo,
        related_name="usuarios",
        blank=True,
    )

    class Meta:
        db_table = "core_usuario"

    @property
    def es_administrador(self):
        """Rol administrador (permisos elevados dentro de cada módulo asignado)."""
        return self.rol == self.ROL_ADMINISTRADOR

    @property
    def es_superadmin(self):
        """Acceso a todos los módulos activos sin filas en core_usuario_modulo."""
        return self.is_superuser

    def _codigos_modulos_asignados(self):
        return list(
            self.accesos_modulo.filter(modulo__activo=True)
            .order_by("modulo__codigo")
            .values_list("modulo__codigo", flat=True)
        )

    def get_auth_revision(self):
        """Análoga a la del Portal — no se usa hoy (la revalidación federada
        se hace contra la Identity remota, ver paldaca_sso/revision.py), pero
        se deja disponible por si algún día hace falta comparar estado local."""
        if self.is_superuser:
            module_part = "*"
        else:
            module_part = ",".join(self._codigos_modulos_asignados())
        raw_value = "|".join(
            [
                str(self.pk or ""),
                self.rol,
                str(self.disciplina_id or ""),
                str(self.perfil_id or ""),
                "1" if self.is_active else "0",
                module_part,
            ]
        )
        return hashlib.sha256(raw_value.encode("utf-8")).hexdigest()

    def tiene_acceso_modulo(self, modulo_codigo):
        codigo = (modulo_codigo or "").strip().lower()
        if not codigo or not self.is_active:
            return False
        if self.is_superuser:
            return Modulo.objects.filter(codigo=codigo, activo=True).exists()
        return self.accesos_modulo.filter(
            modulo__codigo=codigo,
            modulo__activo=True,
        ).exists()
