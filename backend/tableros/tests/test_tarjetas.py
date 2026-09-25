"""Tarjetas: alta, edición con historial, movimiento, concurrencia, archivo y traslado."""

from tableros.models import Card, Tablero
from core.testing import crear_usuario

from .base import EscenarioTablero


class TarjetasTests(EscenarioTablero):
    def test_numeracion_y_responsables_validos(self):
        a = self.crear_card(responsables=[self.beto.pk])
        b = self.crear_card()
        self.assertEqual((a["numero"], b["numero"]), (1, 2))
        self.assertEqual([p["id"] for p in a["responsables"]], [self.beto.pk])
        r = self.cliente(self.ana).post(
            f"/api/v1/tableros/{self.tablero['id']}/cards/",
            {"titulo": "x", "responsables": [self.ajeno.pk]},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_fechas_invertidas_se_rechazan(self):
        r = self.cliente(self.ana).post(
            f"/api/v1/tableros/{self.tablero['id']}/cards/",
            {"titulo": "x", "fecha_inicio": "2026-10-10", "fecha_fin": "2026-10-01"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_edicion_registra_antes_y_despues(self):
        card = self.crear_card()
        self.cliente(self.ana).patch(
            f"/api/v1/cards/{card['id']}/",
            {"titulo": "Plano v2", "urgencia": "alta", "columna": self.col_curso, "version": card["version"]},
            format="json",
        )
        historial = self.cliente(self.ana).get(f"/api/v1/cards/{card['id']}/actividad/").json()
        cambios = {(h["accion"], h["detalle"].get("campo")): h["detalle"] for h in historial}
        self.assertEqual(cambios[("edito", "titulo")]["despues"], "Plano v2")
        self.assertEqual(cambios[("edito", "urgencia")]["antes"], "media")
        self.assertEqual(cambios[("movio", None)], {"desde": "Tareas", "hacia": "En curso"})

    def test_mover_a_hecho_completa_y_sacarla_limpia(self):
        card = self.crear_card()
        r = self.cliente(self.beto).post(
            f"/api/v1/cards/{card['id']}/mover/", {"columna": self.col_hecho, "posicion": 0}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(r.json()["completada_en"])
        self.assertEqual(r.json()["vencimiento"], "terminada")
        r = self.cliente(self.beto).post(
            f"/api/v1/cards/{card['id']}/mover/", {"columna": self.col_curso, "posicion": 0}, format="json"
        )
        self.assertIsNone(r.json()["completada_en"])

    def test_mover_reordena_la_columna(self):
        a, b, c = (self.crear_card(titulo=t) for t in "abc")
        self.cliente(self.ana).post(
            f"/api/v1/cards/{c['id']}/mover/", {"columna": self.col_tareas, "posicion": 0}, format="json"
        )
        orden = list(Card.objects.filter(columna_id=self.col_tareas).order_by("orden").values_list("titulo", flat=True))
        self.assertEqual(orden, ["c", "a", "b"])

    def test_version_vieja_devuelve_409_sin_pisar(self):
        card = self.crear_card()
        url = f"/api/v1/cards/{card['id']}/"
        ok = self.cliente(self.ana).patch(url, {"titulo": "Uno", "version": card["version"]}, format="json")
        self.assertEqual(ok.status_code, 200)
        r = self.cliente(self.beto).patch(url, {"titulo": "Dos", "version": card["version"]}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["actual"]["titulo"], "Uno")
        self.assertEqual(Card.objects.get(pk=card["id"]).titulo, "Uno")

    def test_archivar_y_restaurar(self):
        card = self.crear_card()
        self.cliente(self.ana).post(f"/api/v1/cards/{card['id']}/archivar/", {}, format="json")
        detalle = self.cliente(self.ana).get(f"/api/v1/tableros/{self.tablero['id']}/").json()
        self.assertEqual(detalle["cards"], [])
        archivadas = self.cliente(self.ana).get(f"/api/v1/tableros/{self.tablero['id']}/archivadas/").json()
        self.assertEqual([c["id"] for c in archivadas], [card["id"]])
        self.cliente(self.ana).post(f"/api/v1/cards/{card['id']}/archivar/", {"archivada": False}, format="json")
        detalle = self.cliente(self.ana).get(f"/api/v1/tableros/{self.tablero['id']}/").json()
        self.assertEqual(len(detalle["cards"]), 1)

    def test_archivar_con_texto_false_restaura(self):
        card = self.cliente(self.ana).post(
            f"/api/v1/tableros/{self.tablero['id']}/cards/", {"titulo": "x"}, format="json"
        ).json()
        url = f"/api/v1/cards/{card['id']}/archivar/"
        self.cliente(self.ana).post(url, {}, format="json")
        r = self.cliente(self.ana).post(url, {"archivada": "false"}, format="json")
        self.assertFalse(r.json()["archivada"])
        r = self.cliente(self.ana).post(url, {"archivada": "quizas"}, format="json")
        self.assertEqual(r.status_code, 400)


class TrasladoTests(EscenarioTablero):
    def test_de_personal_a_equipo(self):
        personal = Tablero.objects.get(tipo="personal", propietario=self.ana) if Tablero.objects.filter(
            tipo="personal", propietario=self.ana
        ).exists() else None
        if personal is None:
            self.cliente(self.ana).get("/api/v1/tableros/")
            personal = Tablero.objects.get(tipo="personal", propietario=self.ana)
        columna = personal.columnas.order_by("orden").last()  # Hecho
        r = self.cliente(self.ana).post(
            f"/api/v1/tableros/{personal.pk}/cards/", {"titulo": "Idea", "columna": columna.pk}, format="json"
        ).json()
        self.cliente(self.ana).post(f"/api/v1/cards/{r['id']}/comentarios/", {"texto": "nota"}, format="json")
        movida = self.cliente(self.ana).post(
            f"/api/v1/cards/{r['id']}/trasladar/", {"tablero": self.tablero["id"]}, format="json"
        ).json()
        self.assertEqual(movida["tablero"]["id"], self.tablero["id"])
        self.assertEqual(movida["columna_nombre"], "Hecho")  # misma columna por nombre
        self.assertEqual(movida["comentarios"], 1)
        # Ahora la ve el equipo.
        self.assertEqual(self.cliente(self.beto).get(f"/api/v1/cards/{r['id']}/").status_code, 200)

    def test_no_se_traslada_a_un_tablero_ajeno(self):
        otro = crear_usuario("otro")
        equipo = self.cliente(otro).post("/api/v1/equipos/", {"nombre": "Ajeno"}, format="json").json()
        ajeno = self.cliente(otro).post("/api/v1/tableros/", {"nombre": "X", "equipo": equipo["id"]}, format="json").json()
        card = self.crear_card()
        r = self.cliente(self.ana).post(f"/api/v1/cards/{card['id']}/trasladar/", {"tablero": ajeno["id"]}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_entre_personales_si_de_equipo_a_personal_no(self):
        mio = next(t for t in self.cliente(self.ana).get("/api/v1/tableros/").json() if t["nombre"] == "Mi tablero")
        ideas = self.cliente(self.ana).post("/api/v1/tableros/", {"nombre": "Ideas"}, format="json").json()
        suelta = self.cliente(self.ana).post(f"/api/v1/tableros/{mio['id']}/cards/", {"titulo": "Idea"}, format="json").json()
        r = self.cliente(self.ana).post(f"/api/v1/cards/{suelta['id']}/trasladar/", {"tablero": ideas["id"]}, format="json")
        self.assertEqual((r.status_code, r.json()["tablero"]["id"]), (200, ideas["id"]))
        del_equipo = self.crear_card()
        r = self.cliente(self.ana).post(f"/api/v1/cards/{del_equipo['id']}/trasladar/", {"tablero": ideas["id"]}, format="json")
        self.assertEqual(r.status_code, 400)
