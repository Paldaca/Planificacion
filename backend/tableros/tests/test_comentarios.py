"""Comentarios: propios, borrado suave."""

from .base import EscenarioTablero


class ComentariosTests(EscenarioTablero):
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
