"""Adjuntos de una tarjeta (contenido en la base, D-16) y su acción en el historial."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tableros', '0008_etiqueta_es_hito'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='actividad',
            name='accion',
            field=models.CharField(choices=[('creo', 'Creó la tarjeta'), ('movio', 'Movió la tarjeta'), ('edito', 'Editó un campo'), ('asigno', 'Asignó responsables'), ('desasigno', 'Quitó responsables'), ('comento', 'Comentó'), ('checklist', 'Cambió el checklist'), ('archivo', 'Archivó la tarjeta'), ('restauro', 'Restauró la tarjeta'), ('traslado', 'Trasladó la tarjeta de tablero'), ('dependencia', 'Cambió una dependencia'), ('adjunto', 'Cambió un adjunto')], max_length=12),
        ),
        migrations.CreateModel(
            name='Adjunto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=200)),
                ('tipo', models.CharField(blank=True, max_length=100)),
                ('tamano', models.PositiveIntegerField()),
                ('contenido', models.BinaryField()),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('card', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='adjuntos', to='tableros.card')),
                ('subido_por', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'planificacion_adjunto',
                'ordering': ['creado_en', 'id'],
            },
        ),
    ]
