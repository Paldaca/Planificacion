from django.contrib import admin

from .models import Plantilla


@admin.register(Plantilla)
class PlantillaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "alcance", "equipo", "propietario", "creada_en")
    list_filter = ("alcance",)
    raw_id_fields = ("propietario", "equipo", "creada_por")
