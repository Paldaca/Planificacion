"""Invitaciones: nadie entra sin aceptar; cada paso avisa o resuelve en el Portal."""

import json
from unittest import mock

from django.core import mail
from django.test import override_settings

from core.testing import ConAvisos, crear_usuario
from equipos.models import EstadoInvitacion, InvitacionEquipo, MiembroEquipo
from integracion_portal.services import notificaciones
from integracion_portal.services import notificaciones as n

from .base import EscenarioEquipos


class InvitacionesTests(EscenarioEquipos):
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
            urls = [llamada.args[0].full_url for llamada in urlopen.call_args_list]
            self.assertTrue(any(u.endswith("/api/notificaciones/eventos/resolver/") for u in urls))
            # Además, quien invitó recibe la respuesta.
            self.assertTrue(any(u.endswith("/api/notificaciones/eventos/") for u in urls))

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

    @override_settings(DEFAULT_FROM_EMAIL="notificaciones@cpaldaca.com")
    def test_invitar_envia_correo_al_invitado(self):
        equipo = self.crear_equipo()
        with self.captureOnCommitCallbacks(execute=True):
            r = self.cliente(self.ana).post(
                f"/api/v1/equipos/{equipo['id']}/invitaciones/",
                {"usuario": self.beto.pk, "rol": "miembro", "mensaje": "Te necesitamos en obra"},
                format="json",
            )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(mail.outbox), 1)
        enviado = mail.outbox[0]
        self.assertEqual(enviado.from_email, "notificaciones@cpaldaca.com")
        self.assertEqual(enviado.to, ["beto@cpaldaca.com"])
        self.assertEqual(enviado.subject, "Invitación al equipo Ingeniería")
        self.assertIn("Te necesitamos en obra", enviado.body)
        self.assertIn(
            n.url_en_portal(f"/invitaciones?invitacion={r.json()['id']}"),
            enviado.body,
        )
        with self.captureOnCommitCallbacks(execute=True):
            self.cliente(self.beto).post(f"/api/v1/invitaciones/{r.json()['id']}/aceptar/")
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(DEFAULT_FROM_EMAIL="notificaciones@cpaldaca.com")
    def test_invitar_sin_correo_sigue_creando_la_invitacion(self):
        self.beto.email = ""
        self.beto.save(update_fields=["email"])
        equipo = self.crear_equipo()
        with self.captureOnCommitCallbacks(execute=True):
            r = self.cliente(self.ana).post(
                f"/api/v1/equipos/{equipo['id']}/invitaciones/",
                {"usuario": self.beto.pk},
                format="json",
            )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(mail.outbox, [])

    @override_settings(DEFAULT_FROM_EMAIL="notificaciones@cpaldaca.com")
    def test_fallo_de_correo_no_anula_la_invitacion(self):
        equipo = self.crear_equipo()
        with mock.patch("equipos.services.invitaciones.send_mail", side_effect=OSError("smtp caido")):
            with self.captureOnCommitCallbacks(execute=True):
                r = self.cliente(self.ana).post(
                    f"/api/v1/equipos/{equipo['id']}/invitaciones/",
                    {"usuario": self.beto.pk},
                    format="json",
                )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(mail.outbox, [])
        self.assertTrue(
            InvitacionEquipo.objects.filter(equipo_id=equipo["id"], invitado=self.beto).exists()
        )

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


class InvitacionRespondidaTests(ConAvisos):
    def test_quien_invita_se_entera_de_la_respuesta(self):
        ana = crear_usuario("ana", portal_id=11)
        beto = crear_usuario("beto", portal_id=22)
        equipo = self.cliente(ana).post("/api/v1/equipos/", {"nombre": "Obra"}, format="json").json()
        inv = self.cliente(ana).post(
            f"/api/v1/equipos/{equipo['id']}/invitaciones/", {"usuario": beto.pk}, format="json"
        ).json()
        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.cliente(beto).post(f"/api/v1/invitaciones/{inv['id']}/aceptar/")
        [aviso] = self.emitidos(n.INVITACION_RESPONDIDA)
        self.assertEqual(aviso["payload"]["usuario_ids"], [11])
        self.assertIn("aceptó", aviso["titulo"])
        historial = self.cliente(ana).get(f"/api/v1/equipos/{equipo['id']}/invitaciones/").json()
        self.assertEqual([i["estado"] for i in historial], ["aceptada"])
