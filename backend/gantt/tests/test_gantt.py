"""Gantt: inclusión, dependencias sin ciclos y reprogramación en días hábiles.

Fechas de 2026 elegidas a propósito: el jueves 2 y el viernes 3 de abril son
Semana Santa, así se comprueba que la cadena salta feriados."""

import datetime

from gantt.models import Dependencia, TipoDependencia
from gantt.services.dependencias import restriccion
from tableros.models import Card
from tableros.tests.base import EscenarioTablero

D = datetime.date


class InclusionTests(EscenarioTablero):
    def test_la_card_manda_y_si_hereda_decide_la_columna(self):
        hereda = self.crear_card(titulo="hereda")
        forzada = self.crear_card(titulo="forzada", en_gantt="si")
        columna = next(c for c in self.tablero["columnas"] if c["id"] == self.col_tareas)
        self.cliente(self.ana).patch(
            f"/api/v1/columnas/{self.col_tareas}/", {"incluir_en_gantt": False, "version": columna["version"]}, format="json"
        )
        cards = {c["titulo"]: c for c in self.cliente(self.ana).get(f"/api/v1/tableros/{self.tablero['id']}/").json()["cards"]}
        self.assertFalse(cards[hereda["titulo"]]["en_gantt_efectivo"])
        self.assertTrue(cards[forzada["titulo"]]["en_gantt_efectivo"])


class DependenciasTests(EscenarioTablero):
    def enlazar(self, pred, suc, usuario=None, **extra):
        return self.cliente(usuario or self.ana).post(
            f"/api/v1/tableros/{self.tablero['id']}/dependencias/",
            {"predecesora": pred["id"], "sucesora": suc["id"], **extra},
            format="json",
        )

    def test_crear_listar_y_marcar_incumplidas(self):
        a = self.crear_card(titulo="A", fecha_inicio="2026-03-30", fecha_fin="2026-04-01")
        b = self.crear_card(titulo="B", fecha_inicio="2026-04-01", fecha_fin="2026-04-01")
        r = self.enlazar(a, b)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.json()["incumplida"])  # B empieza el mismo día que A termina
        lista = self.cliente(self.beto).get(f"/api/v1/tableros/{self.tablero['id']}/dependencias/").json()
        self.assertEqual([(d["predecesora"], d["sucesora"]) for d in lista], [(a["id"], b["id"])])

    def test_empezar_en_fin_de_semana_cuenta_como_el_lunes(self):
        a = self.crear_card(titulo="A", fecha_inicio="2026-03-23", fecha_fin="2026-03-27")  # termina viernes
        b = self.crear_card(titulo="B", fecha_inicio="2026-03-28", fecha_fin="2026-03-31")  # empieza sábado
        self.assertFalse(self.enlazar(a, b).json()["incumplida"])

    def test_ciclos_repetidas_y_a_si_misma(self):
        a, b, c = (self.crear_card(titulo=t) for t in "ABC")
        self.assertEqual(self.enlazar(a, b).status_code, 201)
        self.assertEqual(self.enlazar(b, c).status_code, 201)
        r = self.enlazar(c, a)
        self.assertEqual(r.status_code, 400)
        self.assertIn("ciclo", r.json()["detail"])
        self.assertEqual(self.enlazar(a, b).status_code, 400)
        self.assertEqual(self.enlazar(a, a).status_code, 400)

    def test_permisos_y_otro_tablero(self):
        a, b = self.crear_card(titulo="A"), self.crear_card(titulo="B")
        self.assertEqual(self.enlazar(a, b, usuario=self.lector).status_code, 403)
        self.cliente(self.ana).get("/api/v1/tableros/")  # crea su tablero personal
        personal = self.cliente(self.ana).get("/api/v1/tableros/").json()
        personal_id = next(t["id"] for t in personal if t["tipo"] == "personal")
        ajena = self.cliente(self.ana).post(f"/api/v1/tableros/{personal_id}/cards/", {"titulo": "X"}, format="json").json()
        self.assertEqual(self.enlazar(a, ajena).status_code, 400)

    def test_borrar_y_queda_en_el_historial(self):
        a, b = self.crear_card(titulo="A"), self.crear_card(titulo="B")
        dep = self.enlazar(a, b).json()
        self.assertEqual(self.cliente(self.beto).delete(f"/api/v1/dependencias/{dep['id']}/").status_code, 204)
        historial = self.cliente(self.ana).get(f"/api/v1/cards/{b['id']}/actividad/").json()
        cambios = [h["detalle"]["cambio"] for h in historial if h["accion"] == "dependencia"]
        self.assertEqual(cambios, ["quito", "agrego"])

    def test_trasladar_quita_las_dependencias(self):
        a, b = self.crear_card(titulo="A"), self.crear_card(titulo="B")
        self.enlazar(a, b)
        otro = self.cliente(self.ana).post("/api/v1/tableros/", {"nombre": "Otro", "equipo": self.equipo_id}, format="json").json()
        self.cliente(self.ana).post(f"/api/v1/cards/{b['id']}/trasladar/", {"tablero": otro["id"]}, format="json")
        self.assertFalse(Dependencia.objects.exists())


class RestriccionTests(EscenarioTablero):
    def test_tres_tipos_en_dias_habiles(self):
        pred = Card(fecha_inicio=D(2026, 3, 31), fecha_fin=D(2026, 4, 1))
        fs = restriccion(TipoDependencia.FIN_INICIO, 0, pred)
        self.assertEqual((fs.campo, fs.fecha), ("inicio", D(2026, 4, 6)))  # salta Semana Santa y el fin de semana
        self.assertEqual(restriccion(TipoDependencia.FIN_INICIO, -1, pred).fecha, D(2026, 4, 1))  # solape
        ss = restriccion(TipoDependencia.INICIO_INICIO, 2, pred)
        self.assertEqual((ss.campo, ss.fecha), ("inicio", D(2026, 4, 6)))
        ff = restriccion(TipoDependencia.FIN_FIN, 1, pred)
        self.assertEqual((ff.campo, ff.fecha), ("fin", D(2026, 4, 6)))
        self.assertIsNone(restriccion(TipoDependencia.FIN_INICIO, 0, Card()))


class ProgramarTests(EscenarioTablero):
    def setUp(self):
        super().setUp()
        self.a = self.crear_card(titulo="A", fecha_inicio="2026-03-30", fecha_fin="2026-03-31")
        self.b = self.crear_card(titulo="B", fecha_inicio="2026-04-01", fecha_fin="2026-04-01")
        self.c = self.crear_card(titulo="C", fecha_inicio="2026-04-06", fecha_fin="2026-04-07")
        for pred, suc in ((self.a, self.b), (self.b, self.c)):
            Dependencia.objects.create(predecesora_id=pred["id"], sucesora_id=suc["id"])

    def programar(self, card, inicio, fin, **extra):
        return self.cliente(self.beto).post(
            f"/api/v1/cards/{card['id']}/programar/",
            {"fecha_inicio": inicio, "fecha_fin": fin, "version": Card.objects.get(pk=card["id"]).version, **extra},
            format="json",
        )

    def fechas(self, card):
        c = Card.objects.get(pk=card["id"])
        return c.fecha_inicio.isoformat(), c.fecha_fin.isoformat()

    def test_retrasar_empuja_la_cadena_saltando_feriados(self):
        r = self.programar(self.a, "2026-03-31", "2026-04-01")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.fechas(self.b), ("2026-04-06", "2026-04-06"))  # 2 y 3 son Semana Santa
        self.assertEqual(self.fechas(self.c), ("2026-04-07", "2026-04-08"))  # conserva 2 días hábiles
        self.assertEqual({c["titulo"] for c in r.json()["cards"]}, {"A", "B", "C"})

    def test_sin_mover_sucesoras_queda_incumplida(self):
        self.programar(self.a, "2026-03-31", "2026-04-01", mover_sucesoras=False)
        self.assertEqual(self.fechas(self.b), ("2026-04-01", "2026-04-01"))
        deps = self.cliente(self.ana).get(f"/api/v1/tableros/{self.tablero['id']}/dependencias/").json()
        self.assertEqual([d["incumplida"] for d in deps], [True, False])

    def test_adelantar_no_arrastra(self):
        self.programar(self.a, "2026-03-23", "2026-03-24")
        self.assertEqual(self.fechas(self.b), ("2026-04-01", "2026-04-01"))

    def test_terminada_no_se_mueve(self):
        self.cliente(self.ana).post(f"/api/v1/cards/{self.b['id']}/mover/", {"columna": self.col_hecho, "posicion": 0}, format="json")
        self.programar(self.a, "2026-03-31", "2026-04-01")
        self.assertEqual(self.fechas(self.b), ("2026-04-01", "2026-04-01"))

    def test_version_vieja_409_y_lector_403(self):
        r = self.cliente(self.beto).post(
            f"/api/v1/cards/{self.a['id']}/programar/",
            {"fecha_inicio": "2026-04-01", "fecha_fin": "2026-04-01", "version": 99},
            format="json",
        )
        self.assertEqual(r.status_code, 409)
        r = self.cliente(self.lector).post(
            f"/api/v1/cards/{self.a['id']}/programar/",
            {"fecha_inicio": "2026-04-01", "fecha_fin": "2026-04-01", "version": 1},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_archivada_no_se_reprograma(self):
        self.cliente(self.ana).post(f"/api/v1/cards/{self.a['id']}/archivar/", {}, format="json")
        r = self.programar(self.a, "2026-04-01", "2026-04-01")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Restaura", r.json()["detail"])

    def test_fechas_invertidas_400(self):
        self.assertEqual(self.programar(self.a, "2026-04-10", "2026-04-01").status_code, 400)
