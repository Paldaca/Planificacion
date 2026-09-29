"""Favoritos: cada persona marca sus tableros; no da acceso ni se comparte."""

from equipos.models import MiembroEquipo

from .base import EscenarioTablero


class FavoritosTests(EscenarioTablero):
    def url(self):
        return f"/api/v1/tableros/{self.tablero['id']}/favorito/"

    def favorito_en_lista(self, usuario):
        tableros = self.cliente(usuario).get("/api/v1/tableros/").json()
        return next(t["es_favorito"] for t in tableros if t["id"] == self.tablero["id"])

    def test_marcar_y_quitar(self):
        self.assertFalse(self.favorito_en_lista(self.beto))
        r = self.cliente(self.beto).post(self.url())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"es_favorito": True})
        self.assertTrue(self.favorito_en_lista(self.beto))
        detalle = self.cliente(self.beto).get(f"/api/v1/tableros/{self.tablero['id']}/").json()
        self.assertTrue(detalle["es_favorito"])

        r = self.cliente(self.beto).delete(self.url())
        self.assertEqual(r.json(), {"es_favorito": False})
        self.assertFalse(self.favorito_en_lista(self.beto))

    def test_idempotente(self):
        self.cliente(self.beto).post(self.url())
        self.assertEqual(self.cliente(self.beto).post(self.url()).status_code, 200)
        self.assertEqual(self.cliente(self.beto).delete(self.url()).status_code, 200)
        self.assertEqual(self.cliente(self.beto).delete(self.url()).status_code, 200)

    def test_es_de_cada_persona(self):
        self.cliente(self.beto).post(self.url())
        self.assertFalse(self.favorito_en_lista(self.carla))

    def test_lector_puede_marcarlo(self):
        """Marcar favorito no edita el tablero: basta con verlo."""
        self.assertEqual(self.cliente(self.lector).post(self.url()).status_code, 200)

    def test_quien_no_lo_ve_no_puede_marcarlo(self):
        self.assertEqual(self.cliente(self.ajeno).post(self.url()).status_code, 403)

    def test_no_da_acceso_al_salir_del_equipo(self):
        self.cliente(self.beto).post(self.url())
        MiembroEquipo.objects.filter(usuario=self.beto).delete()
        tableros = self.cliente(self.beto).get("/api/v1/tableros/").json()
        self.assertNotIn(self.tablero["id"], [t["id"] for t in tableros])
        self.assertEqual(self.cliente(self.beto).get(f"/api/v1/tableros/{self.tablero['id']}/").status_code, 403)
