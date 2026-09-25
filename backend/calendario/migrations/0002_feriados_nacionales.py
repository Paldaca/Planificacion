"""
Feriados nacionales FIJOS de Venezuela (LOTTT art. 184 y Ley de Fiestas
Nacionales). Los móviles (Carnaval, Jueves y Viernes Santo) se calculan en
código. Son editables: la empresa puede quitar o añadir días desde la app.
"""

import datetime

from django.db import migrations

ANIO = 2000  # recurrentes: solo cuentan día y mes

FIJOS = (
    (1, 1, "Año Nuevo"),
    (4, 19, "Declaración de la Independencia"),
    (5, 1, "Día del Trabajador"),
    (6, 24, "Batalla de Carabobo"),
    (7, 5, "Día de la Independencia"),
    (7, 24, "Natalicio del Libertador"),
    (10, 12, "Día de la Resistencia Indígena"),
    (12, 24, "Víspera de Navidad"),
    (12, 25, "Navidad"),
    (12, 31, "Fin de año"),
)


def sembrar(apps, schema_editor):
    Feriado = apps.get_model("calendario", "Feriado")
    for mes, dia, nombre in FIJOS:
        Feriado.objects.get_or_create(
            fecha=datetime.date(ANIO, mes, dia), recurrente=True, defaults={"nombre": nombre}
        )


def quitar(apps, schema_editor):
    Feriado = apps.get_model("calendario", "Feriado")
    Feriado.objects.filter(recurrente=True, fecha__in=[datetime.date(ANIO, m, d) for m, d, _ in FIJOS]).delete()


class Migration(migrations.Migration):
    dependencies = [("calendario", "0001_initial")]
    operations = [migrations.RunPython(sembrar, quitar)]
