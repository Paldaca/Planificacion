"""Plantillas que trae el programa: «Proyecto de software» y «Soporte»."""

import datetime
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError

from gantt.models import Dependencia
from gantt.services.dependencias import incumple
from plantillas.models import Plantilla
from plantillas.services.del_sistema import PROYECTO_SOFTWARE, SOPORTE, contenido_proyecto_software, instalar
from tableros.models import Card, Tablero
from tableros.tests.base import EscenarioTablero

D = datetime.date


class InstalarTests(EscenarioTablero):
    def usar(self, nombre, usuario=None, **datos):
        plantilla = Plantilla.objects.get(nombre=nombre)
        r = self.cliente(usuario or self.beto).post(
            f"/api/v1/plantillas/{plantilla.pk}/usar/", {"nombre": "Tablero nuevo", "fecha_inicio": "2026-10-05", **datos}, format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        return Tablero.objects.get(pk=r.json()["tablero"])

    def test_instalar_es_idempotente_y_actualizar_repone(self):
        self.assertEqual(instalar()["creadas"], [PROYECTO_SOFTWARE, SOPORTE])
        self.assertEqual(instalar()["sin_cambios"], [PROYECTO_SOFTWARE, SOPORTE])
        plantilla = Plantilla.objects.get(nombre=PROYECTO_SOFTWARE)
        self.assertEqual((plantilla.alcance, plantilla.propietario, plantilla.equipo), ("global", None, None))
        Plantilla.objects.update(contenido={"formato": 1, "columnas": [], "tarjetas": []})
        salida = StringIO()
        call_command("instalar_plantillas", "--actualizar", stdout=salida)
        self.assertIn("Actualizadas: Proyecto de software, Soporte", salida.getvalue())
        self.assertEqual(Plantilla.objects.get(nombre=PROYECTO_SOFTWARE).contenido, contenido_proyecto_software())

    def test_globales_las_ven_todos_y_solo_las_gestiona_el_administrador_del_modulo(self):
        instalar()
        vista = self.cliente(self.beto).get("/api/v1/plantillas/").json()
        self.assertEqual([(p["nombre"], p["permisos"]["gestionar"]) for p in vista], [(PROYECTO_SOFTWARE, False), (SOPORTE, False)])
        self.assertEqual(vista[0]["resumen"], {"columnas": 5, "tarjetas": 27, "etiquetas": 8, "campos": 3, "duracion": 67})
        self.assertEqual(vista[1]["resumen"], {"columnas": 4, "tarjetas": 2, "etiquetas": 3, "campos": 2, "duracion": None})

    def test_de_un_equipo_solo_las_ven_sus_miembros_y_las_gestionan_sus_administradores(self):
        salida = StringIO()
        call_command("instalar_plantillas", "--equipo", str(self.equipo_id), stdout=salida)
        self.assertIn("Creadas: Proyecto de software, Soporte", salida.getvalue())
        self.assertEqual(set(Plantilla.objects.values_list("alcance", "equipo_id")), {("equipo", self.equipo_id)})
        # Aparte de las globales: las dos conviven y no se pisan.
        instalar()
        self.assertEqual(Plantilla.objects.count(), 4)
        gestiona = lambda usuario: [p["permisos"]["gestionar"] for p in self.cliente(usuario).get("/api/v1/plantillas/").json() if p["alcance"] == "equipo"]  # noqa: E731
        self.assertEqual(gestiona(self.ana), [True, True])
        self.assertEqual(gestiona(self.beto), [False, False])
        self.assertEqual(gestiona(self.ajeno), [])
        with self.assertRaises(CommandError):
            call_command("instalar_plantillas", "--equipo", "9999", stdout=StringIO())

    def test_el_tablero_de_proyecto_sale_completo(self):
        instalar()
        tablero = self.usar(PROYECTO_SOFTWARE)
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
        contenido = Plantilla.objects.get(nombre=PROYECTO_SOFTWARE).contenido
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

        # Los hitos lo son por la etiqueta marcada como tal, no por su nombre.
        self.assertEqual([e.nombre for e in tablero.etiquetas.filter(es_hito=True)], ["Hito"])
        self.assertEqual(
            sorted(c.titulo for c in cards.values() if c.es_hito),
            ["Fase 0 aprobada", "M1 · Revisión del módulo", "M2 · Revisión del módulo", "M3 · Revisión del módulo", "Proyecto entregado"],
        )
        historia = cards["M2 · Historia de usuario 3"]
        self.assertEqual(
            (historia.campos[str(fase.pk)], historia.campos[str(requisito.pk)]), ("Fase 2 · Módulo 2", "HU-2.3")
        )
        self.assertEqual(cards["M1 · Documentar el módulo"].checklist.count(), 7)

        # Su guía del Centro de ayuda viaja al tablero (y solo a él).
        detalle = self.cliente(self.beto).get(f"/api/v1/tableros/{tablero.pk}/").json()
        self.assertEqual(detalle["ayuda"]["titulo"], "Proyecto de software")
        self.assertIn("hitos", [e["id"] for e in detalle["ayuda"]["entradas"]])
        self.assertIsNone(self.cliente(self.ana).get(f"/api/v1/tableros/{self.tablero['id']}/").json()["ayuda"])

        # La tarjeta de tutorial: la metodología y los primeros pasos, sin fecha.
        tutorial = cards["Tutorial: cómo se trabaja en este tablero"]
        self.assertEqual((tutorial.columna.nombre, tutorial.fecha_inicio), ("Pendientes", None))
        self.assertIn("ETIQUETAS", tutorial.descripcion)
        self.assertGreater(tutorial.checklist.count(), 3)

    def test_el_tablero_de_soporte_no_entra_en_el_gantt(self):
        instalar()
        tablero = self.usar(SOPORTE, usuario=self.ana, equipo=self.equipo_id)
        self.assertEqual(
            [(c.nombre, c.incluir_en_gantt, c.es_final) for c in tablero.columnas.activas()],
            [("Entrada", False, False), ("En atención", False, False), ("Esperando", False, False), ("Resuelto", False, True)],
        )
        self.assertEqual([e.nombre for e in tablero.etiquetas.all()], ["Incidencia", "Solicitud", "Mantenimiento"])
        sistema = tablero.campos.get(nombre="Sistema")
        cards = {c.titulo: c for c in Card.objects.filter(tablero=tablero).prefetch_related("etiquetas")}
        self.assertEqual(len(cards), 2)
        self.assertIn("QUÉ ENTRA", cards["Tutorial: cómo se trabaja en este tablero"].descripcion)
        self.assertEqual(tablero.ayuda["titulo"], "Soporte")
        ejemplo = cards["Ejemplo · La impresora de Administración no imprime"]
        self.assertEqual((ejemplo.campos[str(sistema.pk)], [e.nombre for e in ejemplo.etiquetas.all()]), ("Equipos y red", ["Incidencia"]))
        self.assertTrue(all(c.fecha_inicio is None and not c.entra_en_gantt for c in cards.values()))
