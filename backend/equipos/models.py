"""
Equipos de trabajo de Planificación.

Un equipo se crea dentro del módulo (no existe en el Portal). Quien lo crea
queda como administrador; el resto entra SOLO por invitación aceptada: nadie
aparece en un equipo sin haberlo decidido. La invitación genera un aviso en la
campana del Portal (`planificacion.invitacion_equipo`).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q


class RolEquipo(models.TextChoices):
    ADMINISTRADOR = "administrador", "Administrador"
    MIEMBRO = "miembro", "Miembro"
    LECTOR = "lector", "Lector"


class EquipoQuerySet(models.QuerySet):
    def activos(self):
        return self.filter(archivado=False)

    def visibles_para(self, usuario):
        """Activos donde es miembro; el administrador del módulo los ve todos."""
        from core.roles import es_admin_modulo

        qs = self.activos()
        if es_admin_modulo(usuario):
            return qs
        return qs.filter(pk__in=MiembroEquipo.objects.filter(usuario=usuario).values("equipo_id"))


class Equipo(models.Model):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, max_length=2000)
    color = models.CharField(max_length=7, default="#32407b")
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="equipos_creados",
    )
    archivado = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    objects = EquipoQuerySet.as_manager()

    class Meta:
        db_table = "planificacion_equipo"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class MiembroEquipo(models.Model):
    equipo = models.ForeignKey(Equipo, on_delete=models.CASCADE, related_name="miembros")
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="membresias",
    )
    rol = models.CharField(max_length=20, choices=RolEquipo.choices, default=RolEquipo.MIEMBRO)
    agregado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    agregado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "planificacion_miembro_equipo"
        constraints = [
            models.UniqueConstraint(fields=["equipo", "usuario"], name="miembro_unico_por_equipo"),
        ]

    def __str__(self):
        return f"{self.usuario_id} en {self.equipo_id} ({self.rol})"

    @property
    def puede_editar(self) -> bool:
        return self.rol in (RolEquipo.ADMINISTRADOR, RolEquipo.MIEMBRO)


class EstadoInvitacion(models.TextChoices):
    PENDIENTE = "pendiente", "Pendiente"
    ACEPTADA = "aceptada", "Aceptada"
    RECHAZADA = "rechazada", "Rechazada"
    CANCELADA = "cancelada", "Cancelada"


class InvitacionQuerySet(models.QuerySet):
    def pendientes(self):
        return self.filter(estado=EstadoInvitacion.PENDIENTE)

    def pendientes_o_respondidas_desde(self, desde):
        """Lo que ve quien administra el equipo: las vivas y el historial reciente."""
        return self.filter(Q(estado=EstadoInvitacion.PENDIENTE) | Q(respondida_en__gte=desde))


class InvitacionEquipo(models.Model):
    equipo = models.ForeignKey(Equipo, on_delete=models.CASCADE, related_name="invitaciones")
    invitado = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invitaciones_recibidas",
    )
    invitado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="invitaciones_enviadas",
    )
    rol = models.CharField(max_length=20, choices=RolEquipo.choices, default=RolEquipo.MIEMBRO)
    mensaje = models.CharField(max_length=300, blank=True)
    estado = models.CharField(
        max_length=20, choices=EstadoInvitacion.choices, default=EstadoInvitacion.PENDIENTE
    )
    creada_en = models.DateTimeField(auto_now_add=True)
    respondida_en = models.DateTimeField(null=True, blank=True)

    objects = InvitacionQuerySet.as_manager()

    class Meta:
        db_table = "planificacion_invitacion_equipo"
        ordering = ["-creada_en"]
        constraints = [
            # Una sola invitación VIVA por persona y equipo; las respondidas
            # quedan como historial y no bloquean invitar de nuevo.
            models.UniqueConstraint(
                fields=["equipo", "invitado"],
                condition=Q(estado="pendiente"),
                name="invitacion_pendiente_unica",
            ),
        ]

    def __str__(self):
        return f"Invitación {self.pk}: {self.invitado_id} a {self.equipo_id} ({self.estado})"

    @property
    def clave_aviso(self) -> str:
        """`clave_agrupacion` del aviso en el Portal (para resolverlo al responder)."""
        return f"invitacion_equipo:{self.pk}"
