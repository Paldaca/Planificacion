"""Atajo de asignación: todas las tarjetas abiertas de una etiqueta o de una fase a una persona."""

from integracion_portal.services import notificaciones as n
from tableros.models import Actividad, Card

from .base import EscenarioTablero


class AsignarEnLoteTests(EscenarioTablero):
    def setUp(self):
        super().setUp()
        url = f"/api/v1/tableros/{self.tablero['id']}"
        self.civil = self.cliente(self.ana).post(f"{url}/etiquetas/", {"nombre": "Civil"}, format="json").json()
        self.fase = self.cliente(self.ana).post(
            f"{url}/campos/", {"nombre": "Fase", "tipo": "lista", "opciones": ["F0", "F1"]}, format="json"
        ).json()
        campo = str(self.fase["id"])
        self.a = self.crear_card(titulo="A", etiquetas=[self.civil["id"]], campos={campo: "F0"})
        self.b = self.crear_card(titulo="B", etiquetas=[self.civil["id"]], campos={campo: "F0"}, responsables=[self.carla.pk])
        self.c = self.crear_card(titulo="C", campos={campo: "F1"})
        self.hecha = self.crear_card(
            titulo="Hecha", etiquetas=[self.civil["id"]], campos={campo: "F0"}, columna=self.col_hecho
        )
        self.enviados.clear()

    def asignar(self, como=None, **datos):
        """`como`: quién lo pide (ana, que gestiona, si no se dice)."""
        with self.captureOnCommitCallbacks(execute=True):
            return self.cliente(como or self.ana).post(
                f"/api/v1/tableros/{self.tablero['id']}/asignar-en-lote/", datos, format="json"
            )

    def responsables(self, card):
        return sorted(a.usuario.username for a in Card.objects.get(pk=card["id"]).asignaciones.all())

    def test_por_etiqueta_suma_a_la_persona_sin_tocar_las_terminadas(self):
        r = self.asignar(usuario=self.beto.pk, etiqueta=self.civil["id"])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json(), {"tarjetas": 2, "cambiadas": 2})
        self.assertEqual(self.responsables(self.a), ["beto"])
        self.assertEqual(self.responsables(self.b), ["beto", "carla"])
        self.assertEqual(self.responsables(self.c), [])
        self.assertEqual(self.responsables(self.hecha), [])
        self.assertTrue(
            Actividad.objects.filter(card_id=self.a["id"], accion=Actividad.Accion.ASIGNO).exists()
        )

    def test_por_fase_reemplazando_y_un_solo_aviso(self):
        r = self.asignar(usuario=self.beto.pk, campo=self.fase["id"], opcion="F0", reemplazar=True)
        self.assertEqual(r.json(), {"tarjetas": 2, "cambiadas": 2})
        self.assertEqual(self.responsables(self.b), ["beto"])
        [aviso] = self.emitidos(n.CARD_ASIGNADA)
        self.assertEqual(aviso["payload"]["usuario_ids"], [22])
        self.assertIn("2 tarjetas", aviso["titulo"])

    def test_repetirlo_no_cambia_nada(self):
        self.asignar(usuario=self.beto.pk, campo=self.fase["id"], opcion="F0")
        self.enviados.clear()
        r = self.asignar(usuario=self.beto.pk, campo=self.fase["id"], opcion="F0")
        self.assertEqual(r.json(), {"tarjetas": 2, "cambiadas": 0})
        self.assertEqual(self.emitidos(n.CARD_ASIGNADA), [])

    def test_asignarse_a_si_mismo_no_avisa(self):
        self.asignar(usuario=self.ana.pk, etiqueta=self.civil["id"])
        self.assertEqual(self.responsables(self.a), ["ana"])
        self.assertEqual(self.emitidos(n.CARD_ASIGNADA), [])

    def test_validaciones(self):
        self.assertEqual(self.asignar(usuario=self.ajeno.pk, etiqueta=self.civil["id"]).status_code, 400)
        self.assertEqual(self.asignar(usuario=self.beto.pk).status_code, 400)
        self.assertEqual(
            self.asignar(usuario=self.beto.pk, etiqueta=self.civil["id"], campo=self.fase["id"], opcion="F0").status_code,
            400,
        )
        self.assertEqual(self.asignar(usuario=self.beto.pk, campo=self.fase["id"], opcion="F9").status_code, 400)

    def test_solo_quien_gestiona(self):
        r = self.asignar(como=self.beto, usuario=self.beto.pk, etiqueta=self.civil["id"])
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.responsables(self.a), [])
