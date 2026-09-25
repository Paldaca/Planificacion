"""Columnas: gestión, columna final, archivo y orden."""

from tableros.models import Card

from .base import EscenarioTablero


class ColumnasTests(EscenarioTablero):
    def test_solo_admin_del_equipo_gestiona_columnas(self):
        r = self.cliente(self.beto).post(
            f"/api/v1/tableros/{self.tablero['id']}/columnas/", {"nombre": "Revisión"}, format="json"
        )
        self.assertEqual(r.status_code, 403)
        r = self.cliente(self.ana).post(
            f"/api/v1/tableros/{self.tablero['id']}/columnas/", {"nombre": "Revisión"}, format="json"
        )
        self.assertEqual(r.status_code, 201)

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
