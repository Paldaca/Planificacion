"""Escenario común: tres personas con el módulo y una sin él."""

from __future__ import annotations

from core.testing import ApiTestCase, crear_usuario


class EscenarioEquipos(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ana = crear_usuario("ana", portal_id=11)
        self.beto = crear_usuario("beto", portal_id=22)
        self.carla = crear_usuario("carla", portal_id=33)
        self.ajeno = crear_usuario("ajeno", modulo=False)

    def crear_equipo(self, usuario=None, nombre="Ingeniería") -> dict:
        r = self.cliente(usuario or self.ana).post("/api/v1/equipos/", {"nombre": nombre}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()
