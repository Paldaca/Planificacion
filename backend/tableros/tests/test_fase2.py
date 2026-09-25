"""Fase 2: checklist, historial, menciones, avisos, vencimientos, traslado y
entrega fiable de avisos al Portal."""

import datetime
from unittest import mock

from django.test import override_settings
from django.utils import timezone

from equipos.models import MiembroEquipo, RolEquipo
from integracion_portal import notificaciones as n
from integracion_portal.models import AvisoSaliente
from integracion_portal.tests.base import ApiTestCase, crear_usuario
from tableros.avisos import revisar_vencimientos
from tableros.models import Card, Tablero

SECRETO = "s" * 40


class ConAvisos(ApiTestCase):
    """Avisos activos y síncronos; `self.enviados` recoge lo que salió al Portal."""

    def setUp(self):
        super().setUp()
        self.enviados = []
        self._ajustes = override_settings(PALDACA_NOTIF_SECRET=SECRETO, PALDACA_PORTAL_API_URL="http://portal.test")
        self._ajustes.enable()
        self.addCleanup(self._ajustes.disable)
        parche = mock.patch.object(n, "_post", side_effect=self._post_falso)
        parche.start()
        self.addCleanup(parche.stop)
        self.respuesta_portal = (True, False, "")

    def _post_falso(self, ruta, datos, secreto):
        if self.respuesta_portal[0]:
            self.enviados.append((ruta, datos))
        return self.respuesta_portal

    def emitidos(self, codigo):
        return [d for r, d in self.enviados if r.endswith("/eventos/") and d["codigo"] == codigo]

    def resueltos(self, codigo):
        return [d for r, d in self.enviados if r.endswith("/resolver/") and d["codigo"] == codigo]


class Fase2Base(ConAvisos):
    def setUp(self):
        super().setUp()
        self.ana = crear_usuario("ana", portal_id=11)
        self.beto = crear_usuario("beto", portal_id=22)
        self.carla = crear_usuario("carla", portal_id=33)
        equipo = self.cliente(self.ana).post("/api/v1/equipos/", {"nombre": "Obra"}, format="json").json()
        self.equipo_id = equipo["id"]
        for u in (self.beto, self.carla):
            MiembroEquipo.objects.create(equipo_id=self.equipo_id, usuario=u, rol=RolEquipo.MIEMBRO)
        self.tablero = self.cliente(self.ana).post(
            "/api/v1/tableros/", {"nombre": "Plan", "equipo": self.equipo_id}, format="json"
        ).json()
        self.col_tareas, self.col_curso, self.col_hecho = [c["id"] for c in self.tablero["columnas"]]

    def crear_card(self, **datos):
        datos.setdefault("titulo", "Plano general")
        with self.captureOnCommitCallbacks(execute=True):
            r = self.cliente(self.ana).post(f"/api/v1/tableros/{self.tablero['id']}/cards/", datos, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()


class ChecklistYActividadTests(Fase2Base):
    def test_checklist_completo_con_conteo_e_historial(self):
        card = self.crear_card()
        cliente = self.cliente(self.beto)
        a = cliente.post(f"/api/v1/cards/{card['id']}/checklist/", {"texto": "Pedir cotización"}, format="json").json()
        cliente.post(f"/api/v1/cards/{card['id']}/checklist/", {"texto": "Enviar"}, format="json")
        r = cliente.patch(f"/api/v1/checklist/{a['id']}/", {"hecho": True}, format="json").json()
        self.assertTrue(r["hecho"])
        self.assertEqual(r["hecho_por"]["username"], "beto")

        tablero = self.cliente(self.ana).get(f"/api/v1/tableros/{self.tablero['id']}/").json()
        self.assertEqual(tablero["cards"][0]["checklist"], {"hechos": 1, "total": 2})

        detalle = self.cliente(self.ana).get(f"/api/v1/cards/{card['id']}/").json()
        self.assertEqual([i["texto"] for i in detalle["items"]], ["Pedir cotización", "Enviar"])

        acciones = [x["accion"] for x in self.cliente(self.ana).get(f"/api/v1/cards/{card['id']}/actividad/").json()]
        self.assertEqual(acciones, ["checklist", "checklist", "checklist", "creo"])

    def test_edicion_registra_antes_y_despues(self):
        card = self.crear_card()
        self.cliente(self.ana).patch(
            f"/api/v1/cards/{card['id']}/",
            {"titulo": "Plano v2", "urgencia": "alta", "columna": self.col_curso, "version": card["version"]},
            format="json",
        )
        historial = self.cliente(self.ana).get(f"/api/v1/cards/{card['id']}/actividad/").json()
        cambios = {(h["accion"], h["detalle"].get("campo")): h["detalle"] for h in historial}
        self.assertEqual(cambios[("edito", "titulo")]["despues"], "Plano v2")
        self.assertEqual(cambios[("edito", "urgencia")]["antes"], "media")
        self.assertEqual(cambios[("movio", None)], {"desde": "Tareas", "hacia": "En curso"})

    def test_lector_no_toca_el_checklist(self):
        card = self.crear_card()
        lector = crear_usuario("lector")
        MiembroEquipo.objects.create(equipo_id=self.equipo_id, usuario=lector, rol=RolEquipo.LECTOR)
        r = self.cliente(lector).post(f"/api/v1/cards/{card['id']}/checklist/", {"texto": "x"}, format="json")
        self.assertEqual(r.status_code, 403)


class AvisosTests(Fase2Base):
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


class VencimientosTests(Fase2Base):
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


class TrasladoTests(Fase2Base):
    def test_de_personal_a_equipo(self):
        personal = Tablero.objects.get(tipo="personal", propietario=self.ana) if Tablero.objects.filter(
            tipo="personal", propietario=self.ana
        ).exists() else None
        if personal is None:
            self.cliente(self.ana).get("/api/v1/tableros/")
            personal = Tablero.objects.get(tipo="personal", propietario=self.ana)
        columna = personal.columnas.order_by("orden").last()  # Hecho
        r = self.cliente(self.ana).post(
            f"/api/v1/tableros/{personal.pk}/cards/", {"titulo": "Idea", "columna": columna.pk}, format="json"
        ).json()
        self.cliente(self.ana).post(f"/api/v1/cards/{r['id']}/comentarios/", {"texto": "nota"}, format="json")
        movida = self.cliente(self.ana).post(
            f"/api/v1/cards/{r['id']}/trasladar/", {"tablero": self.tablero["id"]}, format="json"
        ).json()
        self.assertEqual(movida["tablero"]["id"], self.tablero["id"])
        self.assertEqual(movida["columna_nombre"], "Hecho")  # misma columna por nombre
        self.assertEqual(movida["comentarios"], 1)
        # Ahora la ve el equipo.
        self.assertEqual(self.cliente(self.beto).get(f"/api/v1/cards/{r['id']}/").status_code, 200)

    def test_no_se_traslada_a_un_tablero_ajeno(self):
        otro = crear_usuario("otro")
        equipo = self.cliente(otro).post("/api/v1/equipos/", {"nombre": "Ajeno"}, format="json").json()
        ajeno = self.cliente(otro).post("/api/v1/tableros/", {"nombre": "X", "equipo": equipo["id"]}, format="json").json()
        card = self.crear_card()
        r = self.cliente(self.ana).post(f"/api/v1/cards/{card['id']}/trasladar/", {"tablero": ajeno["id"]}, format="json")
        self.assertEqual(r.status_code, 403)


class EntregaFiableTests(Fase2Base):
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
