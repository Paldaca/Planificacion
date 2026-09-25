import datetime

from equipos.models import MiembroEquipo, RolEquipo
from integracion_portal.tests.base import ApiTestCase, crear_usuario
from tableros.models import Card, Tablero
from tableros.servicios import dias_habiles_hasta


class TablerosTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ana = crear_usuario("ana")
        self.beto = crear_usuario("beto")
        self.lector = crear_usuario("lector")
        self.ajeno = crear_usuario("ajeno")
        equipo = self.cliente(self.ana).post("/api/v1/equipos/", {"nombre": "Obra"}, format="json").json()
        self.equipo_id = equipo["id"]
        MiembroEquipo.objects.create(equipo_id=self.equipo_id, usuario=self.beto, rol=RolEquipo.MIEMBRO)
        MiembroEquipo.objects.create(equipo_id=self.equipo_id, usuario=self.lector, rol=RolEquipo.LECTOR)
        r = self.cliente(self.ana).post(
            "/api/v1/tableros/", {"nombre": "Plan", "equipo": self.equipo_id}, format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.tablero = r.json()
        self.col_tareas, self.col_curso, self.col_hecho = [c["id"] for c in self.tablero["columnas"]]

    def crear_card(self, usuario=None, **datos):
        datos.setdefault("titulo", "Levantamiento")
        r = self.cliente(usuario or self.ana).post(
            f"/api/v1/tableros/{self.tablero['id']}/cards/", datos, format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    # --- Estructura ----------------------------------------------------------

    def test_columnas_predeterminadas(self):
        nombres = [(c["nombre"], c["es_final"]) for c in self.tablero["columnas"]]
        self.assertEqual(nombres, [("Tareas", False), ("En curso", False), ("Hecho", True)])

    def test_tablero_personal_automatico_y_privado(self):
        tableros = self.cliente(self.beto).get("/api/v1/tableros/").json()
        personales = [t for t in tableros if t["tipo"] == "personal"]
        self.assertEqual(len(personales), 1)
        self.assertEqual(Tablero.objects.filter(tipo="personal", propietario=self.beto).count(), 1)
        r = self.cliente(self.ana).get(f"/api/v1/tableros/{personales[0]['id']}/")
        self.assertEqual(r.status_code, 403)
        # Ni el admin del módulo ve tableros personales ajenos (D-07).
        jefa = crear_usuario("jefa", rol="administrador")
        self.assertEqual(self.cliente(jefa).get(f"/api/v1/tableros/{personales[0]['id']}/").status_code, 403)

    # --- Permisos (tabla §5) -------------------------------------------------

    def test_no_miembro_recibe_403(self):
        self.assertEqual(self.cliente(self.ajeno).get(f"/api/v1/tableros/{self.tablero['id']}/").status_code, 403)

    def test_miembro_edita_lector_solo_consulta(self):
        card = self.crear_card(self.beto)
        self.assertEqual(self.cliente(self.lector).get(f"/api/v1/tableros/{self.tablero['id']}/").status_code, 200)
        r = self.cliente(self.lector).patch(
            f"/api/v1/cards/{card['id']}/", {"titulo": "x", "version": card["version"]}, format="json"
        )
        self.assertEqual(r.status_code, 403)
        r = self.cliente(self.lector).post(f"/api/v1/cards/{card['id']}/comentarios/", {"texto": "hola"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_solo_admin_del_equipo_gestiona_columnas(self):
        r = self.cliente(self.beto).post(
            f"/api/v1/tableros/{self.tablero['id']}/columnas/", {"nombre": "Revisión"}, format="json"
        )
        self.assertEqual(r.status_code, 403)
        r = self.cliente(self.ana).post(
            f"/api/v1/tableros/{self.tablero['id']}/columnas/", {"nombre": "Revisión"}, format="json"
        )
        self.assertEqual(r.status_code, 201)

    # --- Cards ---------------------------------------------------------------

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

    # --- Columnas ------------------------------------------------------------

    def test_archivar_columna_con_cards_exige_destino(self):
        card = self.crear_card(columna=self.col_curso)
        url = f"/api/v1/columnas/{self.col_curso}/archivar/"
        self.assertEqual(self.cliente(self.ana).post(url, {}, format="json").status_code, 400)
        r = self.cliente(self.ana).post(url, {"mover_a": self.col_hecho}, format="json")
        self.assertEqual(r.status_code, 204)
        movida = Card.objects.get(pk=card["id"])
        self.assertEqual(movida.columna_id, self.col_hecho)
        self.assertIsNotNone(movida.completada_en)

    def test_marcar_columna_final_completa_sus_cards(self):
        card = self.crear_card(columna=self.col_curso)
        columna = next(c for c in self.tablero["columnas"] if c["id"] == self.col_curso)
        r = self.cliente(self.ana).patch(
            f"/api/v1/columnas/{self.col_curso}/", {"es_final": True, "version": columna["version"]}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(Card.objects.get(pk=card["id"]).completada_en)

    def test_reordenar_columnas(self):
        nuevo = [self.col_hecho, self.col_tareas, self.col_curso]
        r = self.cliente(self.ana).post(
            f"/api/v1/tableros/{self.tablero['id']}/columnas/reordenar/", {"orden": nuevo}, format="json"
        )
        self.assertEqual([c["id"] for c in r.json()], nuevo)

    # --- Comentarios y Mis tareas ------------------------------------------------

    def test_comentarios_propios(self):
        card = self.crear_card()
        c = self.cliente(self.beto).post(
            f"/api/v1/cards/{card['id']}/comentarios/", {"texto": "Listo el plano"}, format="json"
        ).json()
        self.assertTrue(c["es_mio"])
        self.assertEqual(
            self.cliente(self.ana).patch(f"/api/v1/comentarios/{c['id']}/", {"texto": "x"}, format="json").status_code,
            403,
        )
        self.cliente(self.beto).delete(f"/api/v1/comentarios/{c['id']}/")
        lista = self.cliente(self.ana).get(f"/api/v1/cards/{card['id']}/comentarios/").json()
        self.assertTrue(lista[0]["eliminado"])
        self.assertEqual(lista[0]["texto"], "")

    def test_mis_tareas(self):
        self.crear_card(titulo="mía", responsables=[self.beto.pk], fecha_fin="2026-01-05")
        self.crear_card(titulo="ajena", responsables=[self.ana.pk])
        hecha = self.crear_card(titulo="hecha", responsables=[self.beto.pk])
        self.cliente(self.beto).post(
            f"/api/v1/cards/{hecha['id']}/mover/", {"columna": self.col_hecho, "posicion": 0}, format="json"
        )
        tareas = self.cliente(self.beto).get("/api/v1/mis-tareas/").json()
        self.assertEqual([t["titulo"] for t in tareas], ["mía"])
        self.assertEqual(tareas[0]["tablero"]["nombre"], "Plan")
        self.assertEqual(tareas[0]["vencimiento"], "vencida")


class VencimientoTests(ApiTestCase):
    def test_dias_habiles_saltan_fin_de_semana(self):
        viernes = datetime.date(2026, 9, 25)
        self.assertEqual(dias_habiles_hasta(viernes, datetime.date(2026, 9, 28)), 1)  # lunes
        self.assertEqual(dias_habiles_hasta(viernes, viernes), 0)


class RegresionesAuditoriaTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ana = crear_usuario("ana")
        self.beto = crear_usuario("beto")
        equipo = self.cliente(self.ana).post("/api/v1/equipos/", {"nombre": "Obra"}, format="json").json()
        self.equipo_id = equipo["id"]
        self.miembro = MiembroEquipo.objects.create(equipo_id=self.equipo_id, usuario=self.beto, rol=RolEquipo.MIEMBRO)
        self.tablero = self.cliente(self.ana).post(
            "/api/v1/tableros/", {"nombre": "Plan", "equipo": self.equipo_id}, format="json"
        ).json()

    def test_quitar_miembro_corta_el_acceso_en_la_misma_sesion(self):
        """El permiso no puede quedar cacheado en el usuario entre peticiones."""
        cliente_beto = self.cliente(self.beto)
        url = f"/api/v1/tableros/{self.tablero['id']}/"
        self.assertEqual(cliente_beto.get(url).status_code, 200)
        self.cliente(self.ana).delete(f"/api/v1/equipos/{self.equipo_id}/miembros/{self.miembro.pk}/")
        self.assertEqual(cliente_beto.get(url).status_code, 403)

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
