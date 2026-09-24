from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Disciplina, Modulo, Perfil, UsuarioModulo, UsuarioPaldaca


@admin.register(UsuarioPaldaca)
class UsuarioPaldacaAdmin(UserAdmin):
    """
    La mayoría de estos usuarios son cuentas espejo del Portal (creadas por
    `paldaca_sso.provisioning.upsert_mirror_user`) — editar rol/disciplina/
    perfil aquí no persiste, se sobrescribe en la siguiente revalidación.
    Solo tiene efecto real sobre cuentas locales (break-glass).
    """

    list_display = ("username", "email", "rol", "is_active", "is_superuser")
    list_filter = ("rol", "is_active", "is_superuser")
    # "modulos" queda fuera: es un M2M con `through=UsuarioModulo` explícito,
    # el admin no puede editarlo desde un fieldset (admin.E013). Se ve/edita
    # desde el inline de UsuarioModulo o desde /admin/core/usuariomodulo/.
    fieldsets = UserAdmin.fieldsets + (
        ("PALDACA", {"fields": ("rol", "disciplina", "perfil")}),
    )


@admin.register(Modulo)
class ModuloAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nombre", "activo")


admin.site.register(Disciplina)
admin.site.register(Perfil)
admin.site.register(UsuarioModulo)
