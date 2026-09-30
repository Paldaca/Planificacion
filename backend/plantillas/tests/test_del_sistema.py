"""Plantillas que trae el programa: «Proyecto de software»."""

import datetime
from io import StringIO

from django.core.management import call_command

from gantt.models import Dependencia
from gantt.services.dependencias import incumple
from plantillas.models import Plantilla
from plantillas.services.del_sistema import PROYECTO_SOFTWARE, contenido_proyecto_software, instalar
from tableros.models import Card, Tablero
from tableros.tests.base import EscenarioTablero

D = datetime.date


class InstalarTests(EscenarioTablero):
    def test_instalar_es_idempotente_y_actualizar_repone(self):
        self.assertEqual(instalar()["creadas"], [PROYECTO_SOFTWARE])
        self.assertEqual(instalar()["sin_cambios"], [PROYECTO_SOFTWARE])
        plantilla = Plantilla.objects.get()
        self.assertEqual((plantilla.alcance, plantilla.propietario, plantilla.equipo), ("global", None, None))
        Plantilla.objects.update(contenido={"formato": 1, "columnas": [], "tarjetas": []})
        salida = StringIO()
        call_command("instalar_plantillas", "--actualizar", stdout=salida)
        self.assertIn("Actualizadas: Proyecto de software", salida.getvalue())
        self.assertEqual(Plantilla.objects.get().contenido, contenido_proyecto_software())

    def test_la_ven_todos_y_solo_la_gestiona_el_administrador_del_modulo(self):
        instalar()
        vista = self.cliente(self.beto).get("/api/v1/plantillas/").json()
        self.assertEqual([(p["nombre"], p["permisos"]["gestionar"]) for p in vista], [(PROYECTO_SOFTWARE, False)])
        self.assertEqual(vista[0]["resumen"], {"columnas": 5, "tarjetas": 27, "etiquetas": 8, "campos": 3, "duracion": 67})

    def test_el_tablero_sale_completo(self):
        instalar()
        plantilla = Plantilla.objects.get()
        r = self.cliente(self.beto).post(
            f"/api/v1/plantillas/{plantilla.pk}/usar/", {"nombre": "Sistema de inventario", "fecha_inicio": "2026-10-05"}, format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        tablero = Tablero.objects.get(pk=r.json()["tablero"])
        columnas = list(tablero.columnas.activas())
        self.assertEqual(
            [(c.nombre, c.incluir_en_gantt, c.es_final) for c in columnas],
            [
                ("Pendientes", False, False),
                ("Planificado", True, False),
                ("En curso", True, False),
                ("En revisión", True, False),
                ("Hecho", True, True),
            ],
        )
        contenido = plantilla.contenido
        cards = {c.titulo: c for c in Card.objects.filter(tablero=tablero).prefetch_related("etiquetas", "checklist")}
        self.assertEqual(len(cards), len(contenido["tarjetas"]))

        # Todo lo planificado lleva fechas y una fase que existe; lo demás espera en «Pendientes».
        fase = tablero.campos.get(nombre="Fase")
        requisito = tablero.campos.get(nombre="Requisito")
        for card in cards.values():
            if card.columna.nombre == "Pendientes":
                self.assertIsNone(card.fecha_inicio)
                self.assertFalse(card.entra_en_gantt)
            else:
                self.assertTrue(card.entra_en_gantt, card.titulo)
                self.assertIn(card.campos[str(fase.pk)], fase.opciones, card.titulo)

        # Ninguna dependencia se perdió al crear, y el plan sale sin flechas rotas.
        dependencias = list(Dependencia.objects.del_tablero(tablero).select_related("predecesora", "sucesora"))
        self.assertEqual(len(dependencias), sum(len(t["depende"]) for t in contenido["tarjetas"]))
        self.assertEqual([d for d in dependencias if incumple(d, d.predecesora, d.sucesora)], [])

        # El lunes 12/10 es feriado: la Fase 0 (8 días hábiles desde el 5/10) cierra el jueves 15.
        primera, hito = cards["Documentación general del proyecto"], cards["Fase 0 aprobada"]
        self.assertEqual((primera.fecha_inicio, hito.fecha_inicio, hito.fecha_fin), (D(2026, 10, 5), D(2026, 10, 15), D(2026, 10, 15)))

        hitos = sorted(c.titulo for c in cards.values() if "Hito" in [e.nombre for e in c.etiquetas.all()])
        self.assertEqual(
            hitos,
            ["Fase 0 aprobada", "M1 · Revisión del módulo", "M2 · Revisión del módulo", "M3 · Revisión del módulo", "Proyecto entregado"],
        )
        historia = cards["M2 · Historia de usuario 3"]
        self.assertEqual(
            (historia.campos[str(fase.pk)], historia.campos[str(requisito.pk)]), ("Fase 2 · Módulo 2", "HU-2.3")
        )
        self.assertEqual(cards["M1 · Documentar el módulo"].checklist.count(), 7)
