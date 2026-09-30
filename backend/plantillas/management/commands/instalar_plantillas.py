"""Crea las plantillas globales que trae el programa (p. ej. «Proyecto de software»).

    python manage.py instalar_plantillas
    python manage.py instalar_plantillas --actualizar

Idempotente: la que ya existe (por nombre) se deja como está. Con
`--actualizar` se repone su contenido desde el código; los tableros ya creados
con ella no cambian.
"""

from django.core.management.base import BaseCommand

from plantillas.services.del_sistema import instalar


class Command(BaseCommand):
    help = "Crea las plantillas globales que trae el programa."

    def add_arguments(self, parser):
        parser.add_argument(
            "--actualizar", action="store_true", help="Repone el contenido de las que ya existen."
        )

    def handle(self, *args, **opciones):
        resultado = instalar(actualizar=opciones["actualizar"])
        for estado, nombres in resultado.items():
            if nombres:
                self.stdout.write(f"{estado.replace('_', ' ').capitalize()}: {', '.join(nombres)}")
