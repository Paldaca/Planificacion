"""Checklist de la tarjeta y su rastro en el historial."""

from .base import EscenarioTablero


class ChecklistTests(EscenarioTablero):
    def test_checklist_completo_con_conteo_e_historial(self):
        card = self.crear_card()
        cliente = self.cliente(self.beto)
        a = cliente.post(f"/api/v1/cards/{card['id']}/checklist/", {"texto": "Pedir cotización"}, format="json").json()
        cliente.post(f"/api/v1/cards/{card['id']}/checklist/", {"texto": "Enviar"}, format="json")
        r = cliente.patch(f"/api/v1/checklist/{a['id']}/", {"hecho": True}, format="json").json()
        self.assertTrue(r["hecho"])
        self.assertEqual(r["hecho_por"]["username"], "beto")

        tablero = self.cliente(self.ana).get(f"/api/v1/tableros/{self.tablero['id']}/").json()
        self.assertEqual(tablero["cards"][0]["checklist"], {"hechos": 1, "total": 2})

        detalle = self.cliente(self.ana).get(f"/api/v1/cards/{card['id']}/").json()
        self.assertEqual([i["texto"] for i in detalle["items"]], ["Pedir cotización", "Enviar"])

        acciones = [x["accion"] for x in self.cliente(self.ana).get(f"/api/v1/cards/{card['id']}/actividad/").json()]
        self.assertEqual(acciones, ["checklist", "checklist", "checklist", "creo"])

    def test_lector_no_toca_el_checklist(self):
        card = self.crear_card()
        r = self.cliente(self.lector).post(f"/api/v1/cards/{card['id']}/checklist/", {"texto": "x"}, format="json")
        self.assertEqual(r.status_code, 403)
