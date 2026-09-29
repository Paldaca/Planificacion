"""Gantt en PDF: formato, hojas, configuración de la pantalla, periodo y permisos."""

import datetime
import re

from exportacion.services import pdf
from exportacion.services.datos import Filtros, contenido
from tableros.models import Tablero

from .test_exportacion import Base

PAGINA = re.compile(rb"/Type /Page\b(?!s)")


class PdfTests(Base):
    def opciones(self, **valores):
        return pdf.OpcionesPdf(**valores)

    def plan(self, filtros=None, **valores):
        tablero = Tablero.objects.get(pk=self.tablero["id"])
        return pdf.planificar(contenido(tablero, filtros), self.opciones(**valores))

    def titulos(self, plan):
        return [f.card.titulo if f.tipo == "card" else f"[{f.titulo}]" for f in plan.filas]

    def test_descarga_un_pdf_en_carta_horizontal(self):
        r = self.exportar("pdf")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/pdf")
        self.assertTrue(r.content.startswith(b"%PDF"))
        self.assertIn("gantt-", r["Content-Disposition"])
        self.assertIn(b"/MediaBox [ 0 0 792 612 ]", r.content)
        self.assertEqual(len(PAGINA.findall(r.content)), 1)

    def test_hoja_tabloide_11x17(self):
        r = self.exportar("pdf", hoja="tabloide")
        self.assertIn(b"/MediaBox [ 0 0 1224 792 ]", r.content)

    def test_filas_como_la_pantalla_agrupadas_y_ordenadas_por_inicio(self):
        plan = self.plan()
        # Sin fechas no tiene barra; grupos por columna en su orden.
        self.assertEqual(self.titulos(plan), ["[Tareas]", "Levantamiento", "Revisión", "[En curso]", "Planos"])
        # Por responsable: primero las personas, al final «Sin responsable».
        grupos = [f.clave for f in self.plan(agrupar="responsable").filas if f.tipo == "grupo"]
        self.assertEqual(grupos, [f"p{self.beto.pk}", "p0"])
        self.assertEqual(self.titulos(self.plan(agrupar="ninguna")), ["Levantamiento", "Planos", "Revisión"])

    def test_grupo_plegado_muestra_solo_su_cabecera(self):
        plan = self.plan(plegados=frozenset({f"c{self.col_curso}"}))
        self.assertEqual(self.titulos(plan), ["[Tareas]", "Levantamiento", "Revisión", "[En curso]"])

    def test_respeta_los_filtros(self):
        plan = self.plan(filtros=Filtros(responsables=(self.beto.pk,)))
        self.assertEqual([t for t in self.titulos(plan) if not t.startswith("[")], ["Revisión", "Planos"])

    def test_periodo_solo_las_que_lo_tocan(self):
        plan = self.plan(desde=datetime.date(2026, 4, 6), hasta=datetime.date(2026, 4, 7))
        self.assertEqual([t for t in self.titulos(plan) if not t.startswith("[")], ["Revisión", "Planos"])
        self.assertEqual((plan.desde, plan.hasta), (datetime.date(2026, 4, 6), datetime.date(2026, 4, 7)))

    def test_ajustar_cabe_en_una_hoja_y_zoom_dia_reparte_en_tramos(self):
        largo = {"desde": datetime.date(2026, 1, 1), "hasta": datetime.date(2026, 6, 30)}
        self.assertEqual(len(self.plan(**largo).paginas), 1)
        tramos = self.plan(escala="zoom", zoom="dia", **largo).paginas
        self.assertGreater(len(tramos), 1)
        self.assertEqual(tramos[0].desde, largo["desde"])
        self.assertEqual(tramos[-1].hasta, largo["hasta"])

    def test_parametros_invalidos(self):
        for params in (
            {"zoom": "anio"},
            {"hoja": "a0"},
            {"desde": "2026-04-10", "hasta": "2026-04-01"},
            {"desde": "2026-04-10"},
            {"desde": "10/04/2026", "hasta": "2026-04-20"},
        ):
            with self.subTest(params=params):
                self.assertEqual(self.exportar("pdf", **params).status_code, 400)

    def test_demasiadas_hojas_pide_otra_escala(self):
        r = self.exportar("pdf", escala="zoom", zoom="dia", desde="2000-01-01", hasta="2030-12-31")
        self.assertEqual(r.status_code, 400)
        self.assertIn("hojas", r.json()["detail"])

    def test_texto_fuera_de_la_fuente_y_tablero_vacio_no_rompen(self):
        self.crear_card(titulo="Obra 🚧 ≥ fase ✓", fecha_inicio="2026-04-01", fecha_fin="2026-04-02")
        self.assertEqual(self.exportar("pdf").status_code, 200)
        vacio = self.cliente(self.ana).post("/api/v1/tableros/", {"nombre": "Vacío", "equipo": self.equipo_id}, format="json").json()
        r = self.cliente(self.ana).get(f"/api/v1/tableros/{vacio['id']}/exportar/", {"formato": "pdf"})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b"%PDF"))

    def test_permisos(self):
        self.assertEqual(self.exportar("pdf", usuario=self.lector).status_code, 200)
        self.assertEqual(self.exportar("pdf", usuario=self.ajeno).status_code, 403)
