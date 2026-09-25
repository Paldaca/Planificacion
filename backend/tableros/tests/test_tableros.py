"""Tableros: estructura, tablero personal y permisos (tabla §5)."""

from tableros.models import Tablero
from core.testing import crear_usuario

from .base import EscenarioTablero


class TablerosTests(EscenarioTablero):
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

    def test_quitar_miembro_corta_el_acceso_en_la_misma_sesion(self):
        """El permiso no puede quedar cacheado en el usuario entre peticiones."""
        cliente_beto = self.cliente(self.beto)
        url = f"/api/v1/tableros/{self.tablero['id']}/"
        self.assertEqual(cliente_beto.get(url).status_code, 200)
        self.cliente(self.ana).delete(f"/api/v1/equipos/{self.equipo_id}/miembros/{self.miembro_beto.pk}/")
        self.assertEqual(cliente_beto.get(url).status_code, 403)
