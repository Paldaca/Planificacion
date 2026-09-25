import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="Feriado",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("fecha", models.DateField()),
                ("nombre", models.CharField(max_length=100)),
                ("recurrente", models.BooleanField(default=False, help_text="Se repite cada año (solo cuentan día y mes).")),
                ("creado_en", models.DateTimeField(auto_now_add=True)),
                (
                    "creado_por",
                    models.ForeignKey(
                        blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+", to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "planificacion_feriado", "ordering": ["fecha"]},
        ),
        migrations.AddConstraint(
            model_name="feriado",
            constraint=models.UniqueConstraint(fields=("fecha", "recurrente"), name="feriado_unico_por_fecha"),
        ),
    ]
