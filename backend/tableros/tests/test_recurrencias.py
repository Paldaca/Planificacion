"""Tarjetas recurrentes: fechas, la serie desde una tarjeta, generación idempotente y permisos."""

import datetime
from unittest import mock

from integracion_portal.services import notificaciones as n
from tableros.models import Card, Recurrencia, Tablero
from tableros.services import checklist as servicio_checklist
from tableros.services import recurrencias as rec

from .base import EscenarioTablero

D = datetime.date
HOY = D(2026, 11, 4)


class FechasTests(EscenarioTablero):
    def test_mensual_dia_31_es_el_ultimo_dia_y_se_corre_al_habil_anterior(self):
        self.assertEqual(rec.primera("mensual", 1, 31, D(2026, 11, 4)), D(2026, 11, 30))
        # 31/01/2027 es domingo: vence el viernes 29.
        self.assertEqual(rec.vence(D(2027, 1, 31)), D(2027, 1, 29))
        # Después de un mes corto vuelve al 31.
        self.assertEqual(rec._avanzar("mensual", 1, 31, D(2027, 2, 28)), D(2027, 3, 31))

    def test_semanal_y_cada_tantos(self):
        self.assertEqual(rec.primera("semanal", 2, 4, D(2026, 11, 4)), D(2026, 11, 6))  # viernes
        self.assertEqual(rec._avanzar("semanal", 2, 4, D(2026, 11, 6)), D(2026, 11, 20))
        self.assertEqual(rec._avanzar("mensual", 3, 15, D(2026, 11, 15)), D(2027, 2, 15))

    def test_descripcion_y_periodo(self):
        regla = Recurrencia(frecuencia="mensual", intervalo=3, dia=31)
        self.assertEqual(rec.describir(regla), "Cada 3 meses, el último día")
        self.assertEqual(rec.describir(Recurrencia(frecuencia="semanal", intervalo=1, dia=0)), "Cada semana, el lunes")
        self.assertEqual(rec.periodo("mensual", D(2026, 11, 30)), "noviembre 2026")
        self.assertEqual(rec.periodo("semanal", D(2026, 11, 13)), "semana del 09/11")


@mock.patch("tableros.services.recurrencias.timezone.localdate", return_value=HOY)
class RecurrenciasTests(EscenarioTablero):
    def setUp(self):
        super().setUp()
        url = f"/api/v1/tableros/{self.tablero['id']}"
        self.etiqueta = self.cliente(self.ana).post(f"{url}/etiquetas/", {"nombre": "Mantenimiento"}, format="json").json()
        self.card = self.crear_card(
            titulo="Respaldo del servidor",
            descripcion="Copiar la base al disco externo.",
            fecha_inicio="2026-11-02",
            fecha_fin="2026-11-02",
            responsables=[self.ana.pk, self.beto.pk],
            etiquetas=[self.etiqueta["id"]],
            urgencia="alta",
        )
        modelo = Card.objects.get(pk=self.card["id"])
        for texto in ("Detener el servicio", "Copiar", "Verificar"):
            servicio_checklist.agregar_item(modelo, texto=texto, actor=self.ana)

    def repetir(self, como=None, **datos):
        datos = {"frecuencia": "mensual", "dia": 30, "anticipacion": 5, **datos}
        return self.cliente(como or self.ana).post(f"/api/v1/cards/{self.card['id']}/recurrencia/", datos, format="json")

    def generar(self, hoy):
        with self.captureOnCommitCallbacks(execute=True):
            return rec.generar(hoy)

    def serie(self, regla_id):
        return list(Card.objects.filter(recurrencia_id=regla_id).exclude(pk=self.card["id"]).order_by("ocurrencia"))

    def test_la_tarjeta_pasa_a_ser_la_primera_de_la_serie(self, _hoy):
        r = self.repetir()
        self.assertEqual(r.status_code, 201, r.content)
        datos = r.json()
        self.assertEqual((datos["proxima"], datos["vence"], datos["se_crea"]), ("2026-11-30", "2026-11-30", "2026-11-23"))
        self.assertEqual(datos["descripcion"], "Cada mes, el día 30")
        self.assertEqual(Card.objects.get(pk=self.card["id"]).recurrencia_id, datos["id"])
        self.assertEqual(self.repetir().status_code, 400)  # ya se repite

    def test_crea_la_tarjeta_cuando_toca_y_una_sola_vez(self, _hoy):
        regla = self.repetir().json()
        self.assertEqual(self.generar(D(2026, 11, 20))["creadas"], 0)  # todavía no
        self.enviados.clear()
        self.assertEqual(self.generar(D(2026, 11, 23))["creadas"], 1)
        [nueva] = self.serie(regla["id"])
        self.assertEqual(nueva.titulo, "Respaldo del servidor · noviembre 2026")
        self.assertEqual((nueva.fecha_inicio, nueva.fecha_fin, nueva.ocurrencia), (D(2026, 11, 23), D(2026, 11, 30), D(2026, 11, 30)))
        self.assertEqual(nueva.urgencia, "alta")
        self.assertEqual(sorted(a.usuario.username for a in nueva.asignaciones.all()), ["ana", "beto"])
        self.assertEqual([e.nombre for e in nueva.etiquetas.all()], ["Mantenimiento"])
        self.assertEqual([i.texto for i in nueva.checklist.all()], ["Detener el servicio", "Copiar", "Verificar"])
        # El sistema la crea: avisa también a quien armó la serie.
        [aviso] = self.emitidos(n.CARD_ASIGNADA)
        self.assertEqual(sorted(aviso["payload"]["usuario_ids"]), [11, 22])
        self.assertIn("Recordatorio", aviso["titulo"])
        self.assertEqual(self.generar(D(2026, 11, 23))["creadas"], 0)
        self.assertEqual(Recurrencia.objects.get(pk=regla["id"]).proxima, D(2026, 12, 30))

    def test_si_el_comando_no_corrio_se_pone_al_dia_con_tope(self, _hoy):
        regla = self.repetir(frecuencia="semanal", dia=0, anticipacion=0).json()
        self.assertEqual(self.generar(D(2027, 6, 1))["creadas"], rec.MAX_POR_CORRIDA)
        self.assertEqual(len(self.serie(regla["id"])), rec.MAX_POR_CORRIDA)

    def test_si_el_modelo_estaba_en_hecho_la_nueva_no_nace_terminada(self, _hoy):
        Card.objects.filter(pk=self.card["id"]).update(columna_id=self.col_hecho)
        regla = self.repetir().json()
        self.generar(D(2026, 11, 23))
        [nueva] = self.serie(regla["id"])
        self.assertIsNone(nueva.completada_en)
        self.assertNotEqual(nueva.columna_id, self.col_hecho)

    def test_pausada_o_tablero_archivado_no_crea(self, _hoy):
        regla = self.repetir().json()
        self.cliente(self.ana).patch(f"/api/v1/recurrencias/{regla['id']}/", {"activa": False}, format="json")
        self.assertEqual(self.generar(D(2026, 11, 23))["creadas"], 0)
        self.cliente(self.ana).patch(f"/api/v1/recurrencias/{regla['id']}/", {"activa": True}, format="json")
        Tablero.objects.filter(pk=self.tablero["id"]).update(archivado=True)
        self.assertEqual(self.generar(D(2026, 11, 23))["creadas"], 0)

    def test_cambiar_el_calendario_y_el_modelo(self, _hoy):
        regla = self.repetir().json()
        self.generar(D(2026, 11, 23))
        [nueva] = self.serie(regla["id"])
        nueva.titulo = "Respaldo completo · noviembre 2026"
        nueva.save()
        r = self.cliente(self.ana).patch(
            f"/api/v1/recurrencias/{regla['id']}/", {"dia": 15, "modelo_desde": nueva.pk}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.content)
        # Se recalcula desde la última creada (30/11): la siguiente, el 15/12.
        self.assertEqual(r.json()["proxima"], "2026-12-15")
        self.assertEqual(r.json()["titulo"], "Respaldo completo")

    def test_quitarla_deja_las_tarjetas(self, _hoy):
        regla = self.repetir().json()
        self.generar(D(2026, 11, 23))
        self.assertEqual(self.cliente(self.ana).delete(f"/api/v1/recurrencias/{regla['id']}/").status_code, 204)
        self.assertTrue(Card.objects.filter(titulo="Respaldo del servidor · noviembre 2026", recurrencia=None).exists())

    def test_solo_quien_gestiona_la_arma_y_todos_la_ven(self, _hoy):
        self.assertEqual(self.repetir(como=self.beto).status_code, 403)
        self.repetir()
        r = self.cliente(self.beto).get(f"/api/v1/tableros/{self.tablero['id']}/recurrencias/")
        self.assertEqual([x["titulo"] for x in r.json()], ["Respaldo del servidor"])

    def test_datos_invalidos(self, _hoy):
        self.assertEqual(self.repetir(frecuencia="semanal", dia=9).status_code, 400)
        self.assertEqual(self.repetir(intervalo=0).status_code, 400)
        self.assertEqual(self.repetir(anticipacion=99).status_code, 400)

    def test_trasladar_saca_la_tarjeta_de_la_serie(self, _hoy):
        self.repetir()
        otro = self.cliente(self.ana).post(
            "/api/v1/tableros/", {"nombre": "Otro", "equipo": self.equipo_id}, format="json"
        ).json()
        r = self.cliente(self.ana).post(f"/api/v1/cards/{self.card['id']}/trasladar/", {"tablero": otro["id"]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(Card.objects.get(pk=self.card["id"]).recurrencia_id)
