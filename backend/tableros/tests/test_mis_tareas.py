"""Mis tareas: lo abierto donde soy responsable, de todos mis tableros."""

from .base import EscenarioTablero


class MisTareasTests(EscenarioTablero):
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
