from django.contrib import admin

from .models import CuentaPortal


@admin.register(CuentaPortal)
class CuentaPortalAdmin(admin.ModelAdmin):
    """
    Solo lectura para los campos propiedad del Portal: esta fila es un
    espejo, no un formulario de alta — crear o editar identidad se hace en
    el Portal, nunca aquí.
    """

    list_display = (
        "usuario",
        "portal_user_id",
        "origen",
        "activo_en_portal",
        "ultima_sincronizacion",
    )
    list_filter = ("origen", "activo_en_portal")
    search_fields = ("usuario__username", "usuario__email", "portal_user_id")
    readonly_fields = (
        "usuario",
        "portal_user_id",
        "origen",
        "revision",
        "payload_snapshot",
        "ultima_sincronizacion",
        "ultimo_error",
        "ultimo_error_en",
        "activo_en_portal",
        "creado_en",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
