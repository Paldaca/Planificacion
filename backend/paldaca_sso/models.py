from django.conf import settings
from django.db import models


class CuentaPortal(models.Model):
    """
    Cuenta espejo de un usuario del Portal PALDACA dentro de la BD de
    Planificación.

    `db_table` deliberadamente genérico (no "planificacion_cuenta_portal"): la
    regla de prefijar tablas con el código de módulo viene de la convención
    de BD COMPARTIDA de la Suite y no aplica aquí — Planificación es dueña de
    su propio esquema.
    """

    ORIGEN_PORTAL = "portal"
    ORIGEN_LOCAL = "local"
    ORIGEN_CHOICES = (
        (ORIGEN_PORTAL, "Sincronizado desde el Portal"),
        (ORIGEN_LOCAL, "Cuenta local (break-glass)"),
    )

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cuenta_portal",
    )
    portal_user_id = models.PositiveIntegerField(
        unique=True,
        help_text="id de core_usuario en el Portal. Clave de unión — no email, no username: esos cambian.",
    )
    origen = models.CharField(max_length=10, choices=ORIGEN_CHOICES, default=ORIGEN_PORTAL)
    revision = models.CharField(max_length=64, blank=True)
    payload_snapshot = models.JSONField(
        null=True,
        blank=True,
        help_text="Último payload crudo de /api/auth/me/, para auditoría y diagnóstico.",
    )
    ultima_sincronizacion = models.DateTimeField(null=True, blank=True)
    ultimo_error = models.TextField(blank=True)
    ultimo_error_en = models.DateTimeField(null=True, blank=True)
    activo_en_portal = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "paldaca_sso_cuenta_portal"
        verbose_name = "Cuenta del Portal"
        verbose_name_plural = "Cuentas del Portal"

    def __str__(self):
        return f"{self.usuario_id} <- portal:{self.portal_user_id}"
