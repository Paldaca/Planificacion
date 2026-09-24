"""
Siembra el módulo 'planificacion' en el core_modulo LOCAL de Planificación.

No es el mismo registro que el del Portal (BD distinta, patrón federado):
este es el catálogo local que `paldaca_sso.provisioning._sync_modulos` usa
para materializar los accesos espejo. Importa por un caso concreto: para un
superadmin del Portal esa función copia "todos los módulos activos LOCALES",
y sobre una tabla vacía eso son cero filas — el gate de acceso seguiría
funcionando (se evalúa contra la identidad remota), pero cualquier chequeo
local posterior (`user.tiene_acceso_modulo("planificacion")`) daría False para
un superadmin, que es justo lo contrario de lo esperado.
"""

from django.db import migrations

CODIGO = "planificacion"
NOMBRE = "Planificación"


def alta_modulo(apps, schema_editor):
    Modulo = apps.get_model("core", "Modulo")
    Modulo.objects.update_or_create(
        codigo=CODIGO,
        defaults={"nombre": NOMBRE, "activo": True},
    )


def baja_modulo(apps, schema_editor):
    Modulo = apps.get_model("core", "Modulo")
    Modulo.objects.filter(codigo=CODIGO).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(alta_modulo, baja_modulo),
    ]
