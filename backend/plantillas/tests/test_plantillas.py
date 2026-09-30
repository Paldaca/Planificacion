"""Fase 5: guardar un tablero como plantilla y crear tableros desde ella."""

import datetime

from core.testing import crear_usuario
from gantt.models import Dependencia
from plantillas.models import Plantilla
from tableros.models import Card, Tablero
from tableros.tests.base import EscenarioTablero

D = datetime.date


class Base(EscenarioTablero):
    """Tablero «Plan» con estructura de fase 5 y tres tarjetas encadenadas.

    Fechas de 2026 a propósito: el 2 y el 3 de abril son Semana Santa."""

    def setUp(self):
        super().setUp()
        url = f"/api/v1/tableros/{self.tablero['id']}"
        self.civil = self.cliente(self.ana).post(f"{url}/etiquetas/", {"nombre": "Civil", "color": "#0d9488"}, format="json").json()
        self.horas = self.cliente(self.ana).post(f"{url}/campos/", {"nombre": "Horas", "tipo": "numero"}, format="json").json()
        columna = next(c for c in self.tablero["columnas"] if c["id"] == self.col_curso)
        self.cliente(self.ana).patch(
            f"/api/v1/columnas/{self.col_curso}/", {"limite_cards": 3, "version": columna["version"]}, format="json"
        )
        self.a = self.crear_card(
            titulo="Levantamiento", fecha_inicio="2026-03-30", fecha_fin="2026-03-31",
            etiquetas=[self.civil["id"]], campos={self.horas["id"]: 16}, responsables=[self.beto.pk],
        )
        self.b = self.crear_card(titulo="Planos", fecha_inicio="2026-04-01", fecha_fin="2026-04-07", columna=self.col_curso)
        self.c = self.crear_card(titulo="Sin fechas")
        self.cliente(self.ana).post(f"/api/v1/cards/{self.b['id']}/checklist/", {"texto": "Planta"}, format="json")
        Dependencia.objects.create(predecesora_id=self.a["id"], sucesora_id=self.b["id"])

    def guardar(self, usuario=None, **datos):
        return self.cliente(usuario or self.ana).post(
            "/api/v1/plantillas/", {"tablero": self.tablero["id"], "nombre": "Proyecto tipo", "alcance": "personal", **datos}, format="json"
        )


class GuardarTests(Base):
    def test_foto_con_fechas_relativas_en_dias_habiles(self):
        r = self.guardar()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["resumen"], {"columnas": 3, "tarjetas": 3, "etiquetas": 1, "campos": 1, "duracion": 5})
        contenido = Plantilla.objects.get().contenido
        tarjetas = {t["titulo"]: t for t in contenido["tarjetas"]}
        # 30/3 = día 0; 31/3 = 1; 1/4 = 2; 6/4 = 3; 7/4 = 4 (2 y 3 son feriado, 4 y 5 fin de semana).
        self.assertEqual((tarjetas["Levantamiento"]["inicio"], tarjetas["Levantamiento"]["fin"]), (0, 1))
        self.assertEqual((tarjetas["Planos"]["inicio"], tarjetas["Planos"]["fin"]), (2, 4))
        self.assertEqual(tarjetas["Levantamiento"]["campos"], {"Horas": 16})
        self.assertEqual(tarjetas["Planos"]["checklist"], ["Planta"])
        self.assertEqual(tarjetas["Planos"]["depende"], [[self.a["numero"], "fin_inicio", 0]])
        self.assertEqual(contenido["columnas"][1]["limite_cards"], 3)
        self.assertNotIn("responsables", tarjetas["Levantamiento"])  # las personas no viajan
        self.assertEqual(contenido["etiquetas"], [{"nombre": "Civil", "color": "#0d9488", "es_hito": False}])

    def test_alcance_segun_rol(self):
        self.assertEqual(self.guardar(usuario=self.beto, alcance="equipo", equipo=self.equipo_id).status_code, 403)
        self.assertEqual(self.guardar(alcance="equipo", equipo=self.equipo_id).status_code, 201)
        self.assertEqual(self.guardar(alcance="global").status_code, 403)
        jefa = crear_usuario("jefa", rol="administrador")
        # El admin del módulo ve los tableros de equipo (soporte) y crea globales.
        self.assertEqual(self.guardar(usuario=jefa, alcance="global").status_code, 201)
        self.assertEqual(self.guardar(usuario=self.ajeno).status_code, 403)

    def test_quien_ve_y_gestiona_cada_una(self):
        personal = self.guardar(nombre="Mía").json()
        de_equipo = self.guardar(nombre="Del equipo", alcance="equipo", equipo=self.equipo_id).json()
        vistas_beto = {p["nombre"]: p for p in self.cliente(self.beto).get("/api/v1/plantillas/").json()}
        self.assertEqual(set(vistas_beto), {"Del equipo"})
        self.assertFalse(vistas_beto["Del equipo"]["permisos"]["gestionar"])
        self.assertEqual(self.cliente(self.beto).get(f"/api/v1/plantillas/{personal['id']}/").status_code, 403)
        self.assertEqual(self.cliente(self.beto).delete(f"/api/v1/plantillas/{de_equipo['id']}/").status_code, 403)
        r = self.cliente(self.ana).patch(f"/api/v1/plantillas/{de_equipo['id']}/", {"nombre": "Renombrada"}, format="json")
        self.assertEqual(r.json()["nombre"], "Renombrada")
        self.assertEqual(self.cliente(self.ana).delete(f"/api/v1/plantillas/{personal['id']}/").status_code, 204)


class UsarTests(Base):
    def usar(self, plantilla_id, usuario=None, **datos):
        return self.cliente(usuario or self.ana).post(
            f"/api/v1/plantillas/{plantilla_id}/usar/", {"nombre": "Proyecto sur", **datos}, format="json"
        )

    def test_crea_el_tablero_con_todo_y_fechas_recalculadas(self):
        plantilla = self.guardar().json()
        r = self.usar(plantilla["id"], equipo=self.equipo_id, fecha_inicio="2026-10-09")  # viernes
        self.assertEqual(r.status_code, 201, r.content)
        nuevo = Tablero.objects.get(pk=r.json()["tablero"])
        self.assertEqual((nuevo.tipo, nuevo.equipo_id), ("equipo", self.equipo_id))
        self.assertEqual([c.nombre for c in nuevo.columnas.activas()], ["Tareas", "En curso", "Hecho"])
        self.assertEqual(nuevo.columnas.activas()[1].limite_cards, 3)
        self.assertEqual([(e.nombre, e.es_hito) for e in nuevo.etiquetas.all()], [("Civil", False)])
        cards = {c.titulo: c for c in Card.objects.filter(tablero=nuevo)}
        # Día 0 = vie 9/10; día 1 = mar 13/10 (el lunes 12 es feriado); días 2 y 4 = 14/10 y 16/10.
        self.assertEqual((cards["Levantamiento"].fecha_inicio, cards["Levantamiento"].fecha_fin), (D(2026, 10, 9), D(2026, 10, 13)))
        self.assertEqual((cards["Planos"].fecha_inicio, cards["Planos"].fecha_fin), (D(2026, 10, 14), D(2026, 10, 16)))
        self.assertIsNone(cards["Sin fechas"].fecha_inicio)
        self.assertEqual(cards["Planos"].columna.nombre, "En curso")
        self.assertEqual([e.nombre for e in cards["Levantamiento"].etiquetas.all()], ["Civil"])
        self.assertEqual(list(cards["Levantamiento"].campos.values()), [16])
        self.assertEqual(list(cards["Levantamiento"].asignaciones.all()), [])
        self.assertEqual([i.texto for i in cards["Planos"].checklist.all()], ["Planta"])
        dep = Dependencia.objects.get(sucesora=cards["Planos"])
        self.assertEqual(dep.predecesora, cards["Levantamiento"])

    def test_la_etiqueta_de_hito_viaja_en_la_plantilla(self):
        self.cliente(self.ana).patch(f"/api/v1/etiquetas/{self.civil['id']}/", {"es_hito": True}, format="json")
        r = self.usar(self.guardar().json()["id"], equipo=self.equipo_id, fecha_inicio="2026-10-09")
        nuevo = Tablero.objects.get(pk=r.json()["tablero"])
        self.assertEqual([(e.nombre, e.es_hito) for e in nuevo.etiquetas.all()], [("Civil", True)])
        self.assertTrue(Card.objects.get(tablero=nuevo, titulo="Levantamiento").es_hito)

    def test_la_guia_de_ayuda_viaja_en_la_plantilla_y_se_limpia(self):
        guia = {
            "titulo": "Obra civil",
            "resumen": "Cómo llevamos las obras.",
            "entradas": [
                {"id": "planos", "titulo": "Planos", "parrafos": ["• **Rev A** primero.", 42, ""]},
                {"titulo": "Sin párrafos", "parrafos": []},  # se descarta
                "no es una entrada",
            ],
            "otra_cosa": "<script>",
        }
        Tablero.objects.filter(pk=self.tablero["id"]).update(ayuda=guia)
        plantilla = self.guardar().json()
        self.assertEqual(Plantilla.objects.get(pk=plantilla["id"]).contenido["ayuda"], guia)
        r = self.usar(plantilla["id"], equipo=self.equipo_id, fecha_inicio="2026-10-09")
        self.assertEqual(
            Tablero.objects.get(pk=r.json()["tablero"]).ayuda,
            {
                "titulo": "Obra civil",
                "resumen": "Cómo llevamos las obras.",
                "entradas": [{"id": "planos", "titulo": "Planos", "parrafos": ["• **Rev A** primero.", "42"]}],
            },
        )
        # Un tablero sin guía no la inventa: la plantilla tampoco la lleva.
        Tablero.objects.filter(pk=self.tablero["id"]).update(ayuda={})
        self.assertNotIn("ayuda", Plantilla.objects.get(pk=self.guardar().json()["id"]).contenido)

    def test_personal_si_no_hay_equipo_y_permisos(self):
        plantilla = self.guardar(alcance="equipo", equipo=self.equipo_id).json()
        r = self.usar(plantilla["id"], usuario=self.beto)  # beto la ve (es del equipo) y crea uno personal
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Tablero.objects.get(pk=r.json()["tablero"]).propietario, self.beto)
        self.assertEqual(self.usar(plantilla["id"], usuario=self.beto, equipo=self.equipo_id).status_code, 403)
        self.assertEqual(self.usar(plantilla["id"], usuario=self.ajeno).status_code, 403)
