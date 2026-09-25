import json
from unittest import mock

from django.test import override_settings

from integracion_portal import notificaciones

from .base import ApiTestCase, crear_usuario

SECRETO = "s" * 40


class FirmaTests(ApiTestCase):
    def test_vector_compartido_de_la_suite(self):
        """Mismo vector que el Portal y los demás satélites (guía de integración,
        anexo de notificaciones). Si falla, el formato divergió y el Portal
        respondería 403 a cada aviso."""
        firma = notificaciones.firmar(
            b'{"codigo": "x"}', "hdt", "1700000000", "clave-de-prueba-paldaca"
        )
        self.assertEqual(
            firma, "3a9d0e031e7a715ce0336a9820b5f5afa39307eea7e5e78850b35b9b8f7b8a0d"
        )

    @override_settings(PALDACA_NOTIF_SECRET="corto")
    def test_secreto_corto_se_ignora(self):
        self.assertEqual(notificaciones.secreto_propio(), "")


class EmitirTests(ApiTestCase):
    def setUp(self):
        self.actor = crear_usuario("ana", portal_id=11)
        self.destino = crear_usuario("beto", portal_id=22)

    @override_settings(PALDACA_NOTIF_SECRET=SECRETO, PALDACA_PORTAL_API_URL="http://portal.test")
    def test_traduce_a_ids_del_portal_y_omite_al_actor(self):
        with mock.patch.object(notificaciones.urllib.request, "urlopen") as urlopen:
            with self.captureOnCommitCallbacks(execute=True):
                notificaciones.emitir(
                    codigo=notificaciones.INVITACION_EQUIPO,
                    titulo="t",
                    cuerpo="c",
                    destinatarios=[self.destino, self.actor],
                    actor=self.actor,
                    ruta="/invitaciones",
                    clave_agrupacion="invitacion_equipo:1",
                )
        peticion = urlopen.call_args[0][0]
        datos = json.loads(peticion.data)
        self.assertEqual(peticion.full_url, "http://portal.test/api/notificaciones/eventos/")
        self.assertEqual(datos["payload"]["usuario_ids"], [22])
        self.assertEqual(datos["emisor_id"], 11)
        self.assertTrue(datos["payload"]["url"].endswith("/planificacion/invitaciones"))
        self.assertEqual(peticion.get_header("X-paldaca-client"), "planificacion")
        firma = notificaciones.firmar(
            peticion.data, "planificacion", peticion.get_header("X-paldaca-timestamp"), SECRETO
        )
        self.assertEqual(peticion.get_header("X-paldaca-signature"), firma)

    def test_sin_secreto_no_llama_al_portal(self):
        with mock.patch.object(notificaciones.urllib.request, "urlopen") as urlopen:
            with self.captureOnCommitCallbacks(execute=True):
                notificaciones.emitir(
                    codigo="x", titulo="t", cuerpo="c", destinatarios=[self.destino], actor=self.actor
                )
        urlopen.assert_not_called()

    @override_settings(PALDACA_NOTIF_SECRET=SECRETO)
    def test_portal_caido_no_lanza(self):
        with mock.patch.object(
            notificaciones.urllib.request, "urlopen", side_effect=OSError("sin red")
        ):
            with self.captureOnCommitCallbacks(execute=True):
                notificaciones.emitir(
                    codigo="x", titulo="t", cuerpo="c", destinatarios=[self.destino], actor=self.actor
                )
