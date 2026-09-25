"""Vencimientos: un aviso por estado, idempotente, resuelto al dejar de aplicar."""

import datetime

from django.utils import timezone

from integracion_portal.services import notificaciones as n
from tableros.models import Card
from tableros.services.vencimientos import revisar as revisar_vencimientos

from .base import EscenarioTablero


class VencimientosTests(EscenarioTablero):
    def test_vencida_se_avisa_una_vez_y_se_resuelve_al_terminar(self):
        ayer = timezone.localdate() - datetime.timedelta(days=1)
        card = self.crear_card(fecha_fin=ayer.isoformat(), responsables=[self.beto.pk])
        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            resumen = revisar_vencimientos()
        self.assertEqual(resumen["avisadas"], 1)
        [aviso] = self.emitidos(n.CARD_VENCIDA)
        self.assertEqual(aviso["payload"]["usuario_ids"], [22])  # el cron no tiene actor
        self.assertEqual(aviso["clave_agrupacion"], f"card_vencida:{card['id']}")

        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(revisar_vencimientos()["avisadas"], 0)  # idempotente

        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.cliente(self.beto).post(
                f"/api/v1/cards/{card['id']}/mover/", {"columna": self.col_hecho, "posicion": 0}, format="json"
            )
        self.assertEqual(len(self.resueltos(n.CARD_VENCIDA)), 1)
        self.assertEqual(Card.objects.get(pk=card["id"]).aviso_vencimiento, "")

    def test_de_por_vencer_a_vencida(self):
        viernes = datetime.date(2026, 9, 25)
        card = self.crear_card(fecha_fin="2026-09-28", responsables=[self.beto.pk])  # lunes
        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            revisar_vencimientos(hoy=viernes)
        self.assertEqual(len(self.emitidos(n.CARD_POR_VENCER)), 1)
        self.enviados.clear()
        with self.captureOnCommitCallbacks(execute=True):
            revisar_vencimientos(hoy=datetime.date(2026, 9, 29))
        self.assertEqual(len(self.resueltos(n.CARD_POR_VENCER)), 1)
        self.assertEqual(len(self.emitidos(n.CARD_VENCIDA)), 1)
        self.assertEqual(Card.objects.get(pk=card["id"]).aviso_vencimiento, "vencida")

    def test_mover_la_fecha_resuelve_el_aviso(self):
        ayer = timezone.localdate() - datetime.timedelta(days=1)
        card = self.crear_card(fecha_fin=ayer.isoformat(), responsables=[self.beto.pk])
        with self.captureOnCommitCallbacks(execute=True):
            revisar_vencimientos()
        self.enviados.clear()
        lejos = timezone.localdate() + datetime.timedelta(days=30)
        version = Card.objects.get(pk=card["id"]).version
        with self.captureOnCommitCallbacks(execute=True):
            self.cliente(self.beto).patch(
                f"/api/v1/cards/{card['id']}/", {"fecha_fin": lejos.isoformat(), "version": version}, format="json"
            )
        self.assertEqual(len(self.resueltos(n.CARD_VENCIDA)), 1)
