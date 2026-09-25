"""Buscador de invitados contra el Portal y creación anticipada de la cuenta espejo."""

from unittest import mock

import requests
from django.contrib.auth import get_user_model
from django.test import override_settings

from equipos.models import InvitacionEquipo, MiembroEquipo
from paldaca_sso import client as sso_client
from paldaca_sso.models import CuentaPortal

from .base import ApiTestCase, crear_usuario

Usuario = get_user_model()


def respuesta(datos, status=200):
    r = mock.Mock()
    r.status_code = status
    r.headers = {"Content-Type": "application/json"}
    r.json.return_value = datos
    return r


def del_portal(pk, username, nombre, apellido, rol="usuario"):
    return {
        "id": pk,
        "username": username,
        "email": f"{username}@cpaldaca.com",
        "first_name": nombre,
        "last_name": apellido,
        "rol": rol,
        "disciplina": {"id": 3, "nombre": "Procesos"},
        "perfil": None,
    }


@override_settings(PALDACA_PORTAL_API_URL="http://portal.test")
class DirectorioPortalTests(ApiTestCase):
    def setUp(self):
        self.ana = crear_usuario("ana", portal_id=11)
        self.beto = crear_usuario("beto", portal_id=22)
        self.equipo = self.cliente(self.ana).post("/api/v1/equipos/", {"nombre": "Obra"}, format="json").json()
        self.cliente_ana = self.cliente(self.ana)
        self.cliente_ana.cookies["paldaca_sessionid"] = "cookie-del-portal"
        sso_client._breaker_record_success()

    def test_busca_en_el_portal_incluye_a_quien_nunca_entro(self):
        portal = [del_portal(22, "beto", "Alberto", "Rojas"), del_portal(33, "vale", "Valeria", "Rojas")]
        with mock.patch.object(sso_client._session, "get", return_value=respuesta({"resultados": portal})) as get:
            r = self.cliente_ana.get("/api/v1/personas/", {"q": "rojas", "equipo": self.equipo["id"]})
        datos = r.json()
        self.assertEqual(datos["fuente"], "portal")
        self.assertEqual(
            [(p["id"], p["portal_id"]) for p in datos["resultados"]],
            [(self.beto.pk, 22), (None, 33)],
        )
        llamada = get.call_args
        self.assertTrue(llamada.args[0].endswith("/api/auth/directorio/modulos/planificacion/personas/"))
        self.assertEqual(llamada.kwargs["cookies"], {"paldaca_sessionid": "cookie-del-portal"})
        self.assertEqual(llamada.kwargs["headers"]["X-Paldaca-Client"], "planificacion")

    def test_excluye_miembros_del_equipo(self):
        MiembroEquipo.objects.create(equipo_id=self.equipo["id"], usuario=self.beto)
        portal = [del_portal(22, "beto", "Alberto", "Rojas")]
        with mock.patch.object(sso_client._session, "get", return_value=respuesta({"resultados": portal})):
            r = self.cliente_ana.get("/api/v1/personas/", {"q": "rojas", "equipo": self.equipo["id"]})
        self.assertEqual(r.json()["resultados"], [])

    def test_portal_caido_usa_el_respaldo_local(self):
        with mock.patch.object(sso_client._session, "get", side_effect=requests.ConnectionError("sin red")):
            r = self.cliente_ana.get("/api/v1/personas/", {"q": "beto"})
        self.assertEqual(r.json()["fuente"], "local")
        self.assertEqual([p["username"] for p in r.json()["resultados"]], ["beto"])

    def test_invitar_por_portal_id_crea_la_cuenta_espejo_confirmada(self):
        confirmado = del_portal(33, "vale", "Valeria", "Rojas", rol="administrador")
        with mock.patch.object(sso_client._session, "get", return_value=respuesta({"resultados": [confirmado]})) as get:
            r = self.cliente_ana.post(
                f"/api/v1/equipos/{self.equipo['id']}/invitaciones/", {"portal_id": 33}, format="json"
            )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(get.call_args.kwargs["params"], {"id": 33})
        cuenta = CuentaPortal.objects.get(portal_user_id=33)
        vale = cuenta.usuario
        self.assertEqual((vale.first_name, vale.disciplina.nombre), ("Valeria", "Procesos"))
        self.assertFalse(vale.is_superuser)
        self.assertFalse(vale.has_usable_password())
        self.assertTrue(vale.tiene_acceso_modulo("planificacion"))
        self.assertEqual(cuenta.revision, "")  # su primer ingreso sincroniza todo
        self.assertTrue(InvitacionEquipo.objects.filter(invitado=vale, estado="pendiente").exists())

    def test_invitar_a_quien_el_portal_no_confirma(self):
        with mock.patch.object(sso_client._session, "get", return_value=respuesta({"resultados": []})):
            r = self.cliente_ana.post(
                f"/api/v1/equipos/{self.equipo['id']}/invitaciones/", {"portal_id": 99}, format="json"
            )
        self.assertEqual(r.status_code, 400)
        self.assertFalse(CuentaPortal.objects.filter(portal_user_id=99).exists())

    def test_invitar_con_portal_caido_no_crea_nada(self):
        with mock.patch.object(sso_client._session, "get", return_value=respuesta({}, status=502)):
            r = self.cliente_ana.post(
                f"/api/v1/equipos/{self.equipo['id']}/invitaciones/", {"portal_id": 33}, format="json"
            )
        self.assertEqual(r.status_code, 503)
        self.assertFalse(Usuario.objects.filter(username="vale").exists())

    def test_invitar_exige_una_sola_referencia(self):
        r = self.cliente_ana.post(f"/api/v1/equipos/{self.equipo['id']}/invitaciones/", {}, format="json")
        self.assertEqual(r.status_code, 400)
