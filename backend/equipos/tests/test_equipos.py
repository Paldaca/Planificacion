import json
from unittest import mock

from django.test import override_settings

from equipos.models import EstadoInvitacion, InvitacionEquipo, MiembroEquipo
from integracion_portal import notificaciones
from integracion_portal.tests.base import ApiTestCase, crear_usuario


class EquiposTests(ApiTestCase):
    def setUp(self):
        self.ana = crear_usuario("ana", portal_id=11)
        self.beto = crear_usuario("beto", portal_id=22)
        self.carla = crear_usuario("carla", portal_id=33)
        self.ajeno = crear_usuario("ajeno", modulo=False)

    def crear_equipo(self, usuario=None, nombre="Ingeniería"):
        r = self.cliente(usuario or self.ana).post("/api/v1/equipos/", {"nombre": nombre}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_quien_crea_queda_como_administrador(self):
        equipo = self.crear_equipo()
        self.assertEqual(equipo["mi_rol"], "administrador")
        self.assertTrue(equipo["permisos"]["administrar"])

    def test_no_miembro_no_ve_el_equipo(self):
        equipo = self.crear_equipo()
        r = self.cliente(self.beto).get(f"/api/v1/equipos/{equipo['id']}/")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.cliente(self.beto).get("/api/v1/equipos/").json(), [])

    def test_buscador_excluye_sin_modulo_miembros_y_pendientes(self):
        equipo = self.crear_equipo()
        cliente = self.cliente(self.ana)
        cliente.post(f"/api/v1/equipos/{equipo['id']}/invitaciones/", {"usuario": self.beto.pk}, format="json")
        corta = cliente.get("/api/v1/personas/", {"q": "ar", "equipo": equipo["id"]}).json()
        self.assertEqual(corta["resultados"], [])  # menos de 3 letras no busca
        # Sin cookie del Portal: respaldo local (cuentas que ya entraron al módulo).
        respuesta = cliente.get("/api/v1/personas/", {"q": "@cpaldaca", "equipo": equipo["id"]}).json()
        self.assertEqual(respuesta["fuente"], "local")
        nombres = {p["username"] for p in respuesta["resultados"]}
        self.assertEqual(nombres, {"carla"})  # ana (yo), beto (pendiente) y ajeno (sin módulo) fuera

    @override_settings(PALDACA_NOTIF_SECRET="s" * 40, PALDACA_PORTAL_API_URL="http://portal.test")
    def test_invitar_avisa_en_el_portal_y_aceptar_lo_resuelve(self):
        equipo = self.crear_equipo()
        with mock.patch.object(notificaciones.urllib.request, "urlopen") as urlopen:
            with self.captureOnCommitCallbacks(execute=True):
                r = self.cliente(self.ana).post(
                    f"/api/v1/equipos/{equipo['id']}/invitaciones/",
                    {"usuario": self.beto.pk, "rol": "miembro"},
                    format="json",
                )
            self.assertEqual(r.status_code, 201, r.content)
            aviso = json.loads(urlopen.call_args[0][0].data)
            self.assertEqual(aviso["codigo"], "planificacion.invitacion_equipo")
            self.assertEqual(aviso["payload"]["usuario_ids"], [22])
            self.assertEqual(aviso["clave_agrupacion"], f"invitacion_equipo:{r.json()['id']}")

            # Todavía no es miembro: solo invitado.
            self.assertFalse(MiembroEquipo.objects.filter(equipo_id=equipo["id"], usuario=self.beto).exists())
            pendientes = self.cliente(self.beto).get("/api/v1/invitaciones/").json()
            self.assertEqual([i["equipo"]["nombre"] for i in pendientes], ["Ingeniería"])

            urlopen.reset_mock()
            with self.captureOnCommitCallbacks(execute=True):
                r = self.cliente(self.beto).post(f"/api/v1/invitaciones/{pendientes[0]['id']}/aceptar/")
            self.assertEqual(r.status_code, 200, r.content)
            resolucion = urlopen.call_args[0][0]
            self.assertTrue(resolucion.full_url.endswith("/api/notificaciones/eventos/resolver/"))

        miembro = MiembroEquipo.objects.get(equipo_id=equipo["id"], usuario=self.beto)
        self.assertEqual(miembro.rol, "miembro")
        self.assertEqual(self.cliente(self.beto).get("/api/v1/invitaciones/").json(), [])

    def test_rechazar_no_agrega_y_permite_reinvitar(self):
        equipo = self.crear_equipo()
        url = f"/api/v1/equipos/{equipo['id']}/invitaciones/"
        inv = self.cliente(self.ana).post(url, {"usuario": self.beto.pk}, format="json").json()
        self.assertEqual(
            self.cliente(self.ana).post(url, {"usuario": self.beto.pk}, format="json").status_code, 400
        )
        self.cliente(self.beto).post(f"/api/v1/invitaciones/{inv['id']}/rechazar/")
        self.assertFalse(MiembroEquipo.objects.filter(usuario=self.beto).exists())
        self.assertEqual(
            self.cliente(self.ana).post(url, {"usuario": self.beto.pk}, format="json").status_code, 201
        )

    def test_solo_el_invitado_responde_y_solo_admins_invitan(self):
        equipo = self.crear_equipo()
        inv = self.cliente(self.ana).post(
            f"/api/v1/equipos/{equipo['id']}/invitaciones/", {"usuario": self.beto.pk}, format="json"
        ).json()
        r = self.cliente(self.carla).post(f"/api/v1/invitaciones/{inv['id']}/aceptar/")
        self.assertEqual(r.status_code, 404)
        self.cliente(self.beto).post(f"/api/v1/invitaciones/{inv['id']}/aceptar/")
        r = self.cliente(self.beto).post(
            f"/api/v1/equipos/{equipo['id']}/invitaciones/", {"usuario": self.carla.pk}, format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_no_se_invita_a_quien_no_tiene_el_modulo(self):
        equipo = self.crear_equipo()
        r = self.cliente(self.ana).post(
            f"/api/v1/equipos/{equipo['id']}/invitaciones/", {"usuario": self.ajeno.pk}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_cancelar_invitacion(self):
        equipo = self.crear_equipo()
        inv = self.cliente(self.ana).post(
            f"/api/v1/equipos/{equipo['id']}/invitaciones/", {"usuario": self.beto.pk}, format="json"
        ).json()
        r = self.cliente(self.ana).post(f"/api/v1/invitaciones/{inv['id']}/cancelar/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(InvitacionEquipo.objects.get(pk=inv["id"]).estado, EstadoInvitacion.CANCELADA)
        r = self.cliente(self.beto).post(f"/api/v1/invitaciones/{inv['id']}/aceptar/")
        self.assertEqual(r.status_code, 400)

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
