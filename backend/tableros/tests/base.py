"""Escenario común: un equipo «Obra» con su tablero «Plan»."""

from __future__ import annotations

from core.testing import ConAvisos, crear_usuario
from equipos.models import MiembroEquipo, RolEquipo


class EscenarioTablero(ConAvisos):
    """ana administra; beto y carla son miembros; lector solo consulta; ajeno no está.

    Ids del Portal fijos (ana 11, beto 22, carla 33) para comprobar destinatarios."""

    def setUp(self):
        super().setUp()
        self.ana = crear_usuario("ana", portal_id=11)
        self.beto = crear_usuario("beto", portal_id=22)
        self.carla = crear_usuario("carla", portal_id=33)
        self.lector = crear_usuario("lector")
        self.ajeno = crear_usuario("ajeno")
        equipo = self.cliente(self.ana).post("/api/v1/equipos/", {"nombre": "Obra"}, format="json").json()
        self.equipo_id = equipo["id"]
        self.miembro_beto = MiembroEquipo.objects.create(
            equipo_id=self.equipo_id, usuario=self.beto, rol=RolEquipo.MIEMBRO
        )
        MiembroEquipo.objects.create(equipo_id=self.equipo_id, usuario=self.carla, rol=RolEquipo.MIEMBRO)
        MiembroEquipo.objects.create(equipo_id=self.equipo_id, usuario=self.lector, rol=RolEquipo.LECTOR)
        r = self.cliente(self.ana).post("/api/v1/tableros/", {"nombre": "Plan", "equipo": self.equipo_id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.tablero = r.json()
        self.col_tareas, self.col_curso, self.col_hecho = [c["id"] for c in self.tablero["columnas"]]

    def crear_card(self, usuario=None, **datos) -> dict:
        datos.setdefault("titulo", "Plano general")
        with self.captureOnCommitCallbacks(execute=True):
            r = self.cliente(usuario or self.ana).post(
                f"/api/v1/tableros/{self.tablero['id']}/cards/", datos, format="json"
            )
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()
