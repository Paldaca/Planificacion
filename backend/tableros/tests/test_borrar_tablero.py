"""Borrar un tablero archivado: solo archivado, solo quien lo gestiona, y se lleva todo."""

from gantt.models import Dependencia
from plantillas.models import AlcancePlantilla, Plantilla
from plantillas.services.plantillas import guardar_como_plantilla
from tableros.models import Actividad, Adjunto, Card, Columna, ItemChecklist, Tablero, TableroFavorito

from .base import EscenarioTablero


class BorrarTableroTests(EscenarioTablero):
    def url(self, tablero_id=None):
        return f"/api/v1/tableros/{tablero_id or self.tablero['id']}/"

    def archivar(self, tablero_id=None, usuario=None):
        r = self.cliente(usuario or self.ana).post(f"{self.url(tablero_id)}archivar/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    def test_activo_no_se_borra(self):
        r = self.cliente(self.ana).delete(self.url())
        self.assertEqual(r.status_code, 400)
        self.assertIn("archívalo primero", r.json()["detail"])
        self.assertTrue(Tablero.objects.filter(pk=self.tablero["id"]).exists())
        self.assertFalse(self.cliente(self.ana).get(self.url()).json()["permisos"]["borrar"])

    def test_archivado_se_borra_con_todo_lo_que_tiene(self):
        a = self.crear_card(titulo="Levantamiento", fecha_inicio="2026-03-30", fecha_fin="2026-04-01")
        b = self.crear_card(titulo="Planos", columna=self.col_curso, responsables=[self.beto.pk])
        Dependencia.objects.create(predecesora_id=a["id"], sucesora_id=b["id"])
        card = Card.objects.get(pk=a["id"])
        ItemChecklist.objects.create(card=card, texto="Medir", orden=0)
        Adjunto.objects.create(card=card, nombre="plano.pdf", tamano=3, contenido=b"pdf")
        TableroFavorito.objects.create(usuario=self.beto, tablero_id=self.tablero["id"])
        plantilla = guardar_como_plantilla(
            Tablero.objects.get(pk=self.tablero["id"]), nombre="Copia del plan", alcance=AlcancePlantilla.PERSONAL, actor=self.ana
        )
        self.archivar()
        self.assertTrue(self.cliente(self.ana).get(self.url()).json()["permisos"]["borrar"])

        r = self.cliente(self.ana).delete(self.url())
        self.assertEqual(r.status_code, 204, r.content)
        tid = self.tablero["id"]
        self.assertFalse(Tablero.objects.filter(pk=tid).exists())
        self.assertFalse(Columna.objects.filter(tablero_id=tid).exists())
        self.assertFalse(Card.objects.filter(tablero_id=tid).exists())
        self.assertFalse(Dependencia.objects.exists())
        self.assertFalse(ItemChecklist.objects.exists())
        self.assertFalse(Adjunto.objects.exists())
        self.assertFalse(Actividad.objects.filter(card_id__in=[a["id"], b["id"]]).exists())
        self.assertFalse(TableroFavorito.objects.filter(tablero_id=tid).exists())
        self.assertEqual(self.cliente(self.ana).get(self.url()).status_code, 404)
        # La plantilla guardada desde el tablero es una copia: queda.
        self.assertTrue(Plantilla.objects.filter(pk=plantilla.pk).exists())

    def test_solo_administradores_del_equipo(self):
        self.archivar()
        for usuario in (self.beto, self.lector, self.ajeno):
            r = self.cliente(usuario).delete(self.url())
            self.assertEqual(r.status_code, 403, usuario.username)
        self.assertTrue(Tablero.objects.filter(pk=self.tablero["id"]).exists())

    def test_personal_archivado_lo_borra_solo_su_dueno(self):
        self.cliente(self.beto).get("/api/v1/tableros/")  # crea su «Mi tablero»
        otro = self.cliente(self.beto).post("/api/v1/tableros/", {"nombre": "Ideas"}, format="json").json()
        self.archivar(otro["id"], usuario=self.beto)
        self.assertEqual(self.cliente(self.ana).delete(self.url(otro["id"])).status_code, 403)
        self.assertEqual(self.cliente(self.beto).delete(self.url(otro["id"])).status_code, 204)
        self.assertFalse(Tablero.objects.filter(pk=otro["id"]).exists())
        # Su «Mi tablero» sigue ahí, y ya no figura entre los archivados.
        archivados = self.cliente(self.beto).get("/api/v1/tableros/?archivados=personales").json()
        self.assertEqual(archivados, [])
        self.assertEqual(Tablero.objects.filter(tipo="personal", propietario=self.beto, archivado=False).count(), 1)
