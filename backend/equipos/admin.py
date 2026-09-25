from django.contrib import admin

from .models import Equipo, InvitacionEquipo, MiembroEquipo


class MiembroInline(admin.TabularInline):
    model = MiembroEquipo
    extra = 0
    raw_id_fields = ["usuario", "agregado_por"]


@admin.register(Equipo)
class EquipoAdmin(admin.ModelAdmin):
    list_display = ["nombre", "archivado", "creado_por", "creado_en"]
    list_filter = ["archivado"]
    search_fields = ["nombre"]
    inlines = [MiembroInline]


@admin.register(InvitacionEquipo)
class InvitacionEquipoAdmin(admin.ModelAdmin):
    list_display = ["equipo", "invitado", "rol", "estado", "invitado_por", "creada_en"]
    list_filter = ["estado", "rol"]
    raw_id_fields = ["invitado", "invitado_por"]
