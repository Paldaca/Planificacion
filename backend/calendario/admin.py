from django.contrib import admin

from .models import Feriado


@admin.register(Feriado)
class FeriadoAdmin(admin.ModelAdmin):
    list_display = ["fecha", "nombre", "recurrente"]
    list_filter = ["recurrente"]
