"""Avisos al Portal: a quién, sin duplicar, y entrega fiable (bandeja de salida)."""

from django.utils import timezone

from equipos.models import MiembroEquipo
from integracion_portal.models import AvisoSaliente
from integracion_portal.services import notificaciones as n

from .base import EscenarioTablero


class AvisosTests(EscenarioTablero):
    def test_asignar_avisa_solo_a_los_nuevos_y_nunca_al_actor(self):
        card = self.crear_card(responsables=[self.ana.pk, self.beto.pk])
        [aviso] = self.emitidos(n.CARD_ASIGNADA)
        self.assertEqual(aviso["payload"]["usuario_ids"], [22])  # beto; ana es quien asigna
        self.assertTrue(aviso["payload"]["url"].endswith(f"/planificacion/tableros/{self.tablero['id']}/cards/1"))
        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.cliente(self.ana).patch(
                f"/api/v1/cards/{card['id']}/",
                {"responsables": [self.ana.pk, self.beto.pk, self.carla.pk], "version": card["version"]},
                format="json",
            )
        [aviso] = self.emitidos(n.CARD_ASIGNADA)
        self.assertEqual(aviso["payload"]["usuario_ids"], [33])

    def test_mencion_y_comentario_sin_duplicar(self):
        card = self.crear_card(responsables=[self.beto.pk, self.carla.pk])
        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            r = self.cliente(self.ana).post(
                f"/api/v1/cards/{card['id']}/comentarios/", {"texto": "@beto revisa el caudal, @nadie"}, format="json"
            )
        self.assertEqual([m["username"] for m in r.json()["menciones"]], ["beto"])
        [mencion] = self.emitidos(n.MENCION)
        self.assertEqual(mencion["payload"]["usuario_ids"], [22])
        [comentario] = self.emitidos(n.COMENTARIO_NUEVO)
        self.assertEqual(comentario["payload"]["usuario_ids"], [33])  # carla, no beto ni ana

    def test_editar_comentario_avisa_solo_menciones_nuevas(self):
        card = self.crear_card()
        with self.captureOnCommitCallbacks(execute=True):
            c = self.cliente(self.ana).post(
                f"/api/v1/cards/{card['id']}/comentarios/", {"texto": "@beto mira"}, format="json"
            ).json()
        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.cliente(self.ana).patch(f"/api/v1/comentarios/{c['id']}/", {"texto": "@beto y @carla miren"}, format="json")
        [mencion] = self.emitidos(n.MENCION)
        self.assertEqual(mencion["payload"]["usuario_ids"], [33])

    def test_exmiembro_no_recibe_avisos(self):
        card = self.crear_card(responsables=[self.beto.pk])
        MiembroEquipo.objects.filter(usuario=self.beto).delete()
        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.cliente(self.ana).post(f"/api/v1/cards/{card['id']}/comentarios/", {"texto": "hola"}, format="json")
        self.assertEqual(self.emitidos(n.COMENTARIO_NUEVO), [])


class EntregaFiableTests(EscenarioTablero):
    def test_portal_caido_queda_pendiente_y_se_reintenta(self):
        self.respuesta_portal = (False, True, "sin red")
        self.crear_card(responsables=[self.beto.pk])
        aviso = AvisoSaliente.objects.get(codigo=n.CARD_ASIGNADA)
        self.assertEqual((aviso.estado, aviso.intentos), ("pendiente", 1))
        self.assertGreater(aviso.proximo_intento, timezone.now())

        self.assertEqual(n.procesar_pendientes()["revisados"], 0)  # aún no es su turno
        AvisoSaliente.objects.filter(pk=aviso.pk).update(proximo_intento=timezone.now())
        self.respuesta_portal = (True, False, "")
        self.assertEqual(n.procesar_pendientes()["enviados"], 1)
        self.assertEqual(AvisoSaliente.objects.get(pk=aviso.pk).estado, "enviado")

    def test_error_definitivo_se_descarta(self):
        self.respuesta_portal = (False, False, "HTTP 400: tipo inactivo")
        self.crear_card(responsables=[self.beto.pk])
        self.assertEqual(AvisoSaliente.objects.get(codigo=n.CARD_ASIGNADA).estado, "descartado")

    def test_resolver_espera_al_emitir_de_la_misma_clave(self):
        self.respuesta_portal = (False, True, "sin red")
        with self.captureOnCommitCallbacks(execute=True):
            n.emitir(codigo="x", titulo="t", cuerpo="c", destinatarios=[self.beto], clave_agrupacion="k:1")
            n.resolver(codigo="x", clave_agrupacion="k:1")
        emitir, resolver = AvisoSaliente.objects.order_by("id")
        self.assertEqual(emitir.intentos, 1)
        self.assertEqual(resolver.intentos, 0)  # no adelantó al emitir
