"""Equipos y miembros: creación, visibilidad y nunca sin administrador."""

from equipos.models import MiembroEquipo
from core.testing import crear_usuario

from .base import EscenarioEquipos


class EquiposTests(EscenarioEquipos):
    def test_quien_crea_queda_como_administrador(self):
        equipo = self.crear_equipo()
        self.assertEqual(equipo["mi_rol"], "administrador")
        self.assertTrue(equipo["permisos"]["administrar"])

    def test_no_miembro_no_ve_el_equipo(self):
        equipo = self.crear_equipo()
        r = self.cliente(self.beto).get(f"/api/v1/equipos/{equipo['id']}/")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.cliente(self.beto).get("/api/v1/equipos/").json(), [])

    def test_el_equipo_nunca_queda_sin_administrador(self):
        equipo = self.crear_equipo()
        yo = MiembroEquipo.objects.get(equipo_id=equipo["id"], usuario=self.ana)
        cliente = self.cliente(self.ana)
        r = cliente.patch(f"/api/v1/equipos/{equipo['id']}/miembros/{yo.pk}/", {"rol": "miembro"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(cliente.post(f"/api/v1/equipos/{equipo['id']}/salir/").status_code, 400)
        self.assertEqual(cliente.delete(f"/api/v1/equipos/{equipo['id']}/miembros/{yo.pk}/").status_code, 400)

    def test_admin_del_modulo_ve_todos_los_equipos(self):
        self.crear_equipo()
        jefa = crear_usuario("jefa", rol="administrador")
        self.assertEqual(len(self.cliente(jefa).get("/api/v1/equipos/").json()), 1)
