"""Etiquetas de hito: las tarjetas que las llevan se dibujan como un rombo."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tableros', '0007_tablero_favorito'),
    ]

    operations = [
        migrations.AddField(
            model_name='etiqueta',
            name='es_hito',
            field=models.BooleanField(default=False),
        ),
    ]
