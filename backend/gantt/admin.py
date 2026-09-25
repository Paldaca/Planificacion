from django.contrib import admin

from .models import Dependencia


@admin.register(Dependencia)
class DependenciaAdmin(admin.ModelAdmin):
    list_display = ("id", "predecesora", "sucesora", "tipo", "desfase_dias", "creada_en")
    list_filter = ("tipo",)
    raw_id_fields = ("predecesora", "sucesora", "creada_por")
