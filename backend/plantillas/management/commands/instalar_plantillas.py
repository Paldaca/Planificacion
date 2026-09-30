"""Crea las plantillas que trae el programa («Proyecto de software» y «Soporte»).

    python manage.py instalar_plantillas                # globales: las ve todo el módulo
    python manage.py instalar_plantillas --equipo 3     # del equipo 3: solo sus miembros
    python manage.py instalar_plantillas --actualizar

Idempotente: la que ya existe (por nombre y alcance) se deja como está. Con
`--actualizar` se repone su contenido desde el código; los tableros ya creados
con ella no cambian.
"""

from django.core.management.base import BaseCommand, CommandError

from equipos.models import Equipo

from plantillas.services.del_sistema import instalar


class Command(BaseCommand):
    help = "Crea las plantillas que trae el programa (globales o de un equipo)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--actualizar", action="store_true", help="Repone el contenido de las que ya existen."
        )
        parser.add_argument(
            "--equipo", type=int, help="Id del equipo: se instalan como plantillas de ese equipo y no globales."
        )

    def handle(self, *args, **opciones):
        equipo = None
        if opciones["equipo"] is not None:
            equipo = Equipo.objects.filter(pk=opciones["equipo"], archivado=False).first()
            if equipo is None:
                activos = ", ".join(f"{e.pk} = {e.nombre}" for e in Equipo.objects.filter(archivado=False).order_by("pk"))
                raise CommandError(f"No hay un equipo activo con id {opciones['equipo']}. Equipos: {activos or 'ninguno'}.")
            self.stdout.write(f"Plantillas del equipo «{equipo.nombre}»:")
        resultado = instalar(actualizar=opciones["actualizar"], equipo=equipo)
        for estado, nombres in resultado.items():
            if nombres:
                self.stdout.write(f"{estado.replace('_', ' ').capitalize()}: {', '.join(nombres)}")
