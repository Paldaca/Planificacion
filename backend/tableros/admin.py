from django.contrib import admin

from .models import Card, Columna, Comentario, Tablero


class ColumnaInline(admin.TabularInline):
    model = Columna
    extra = 0
    fields = ["nombre", "orden", "es_final", "incluir_en_gantt", "archivada"]


@admin.register(Tablero)
class TableroAdmin(admin.ModelAdmin):
    list_display = ["nombre", "tipo", "equipo", "propietario", "archivado"]
    list_filter = ["tipo", "archivado"]
    search_fields = ["nombre"]
    inlines = [ColumnaInline]


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ["numero", "titulo", "tablero", "columna", "urgencia", "fecha_fin", "archivada"]
    list_filter = ["urgencia", "archivada"]
    search_fields = ["titulo"]
    raw_id_fields = ["creada_por"]


@admin.register(Comentario)
class ComentarioAdmin(admin.ModelAdmin):
    list_display = ["card", "autor", "creado_en", "eliminado"]
    raw_id_fields = ["autor", "card"]
