"""Adjuntos de una tarjeta: subir, listar, descargar, quitar, límites y permisos."""

from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile

from tableros.models import Adjunto
from tableros.services import adjuntos as servicio

from .base import EscenarioTablero


class AdjuntosTests(EscenarioTablero):
    def setUp(self):
        super().setUp()
        self.card = self.crear_card(titulo="Documentar el módulo")

    def subir(self, nombre="requisitos.pdf", datos=b"%PDF-1.4 contenido", usuario=None, card=None):
        return self.cliente(usuario or self.beto).post(
            f"/api/v1/cards/{(card or self.card)['id']}/adjuntos/", {"archivo": SimpleUploadedFile(nombre, datos)}, format="multipart"
        )

    def test_subir_listar_descargar_y_quitar(self):
        r = self.subir()
        self.assertEqual(r.status_code, 201, r.content)
        adjunto = r.json()
        self.assertEqual((adjunto["nombre"], adjunto["tipo"], adjunto["tamano"]), ("requisitos.pdf", "application/pdf", 18))
        self.assertNotIn("contenido", adjunto)

        # Viene en la tarjeta abierta y en su propio listado.
        detalle = self.cliente(self.ana).get(f"/api/v1/cards/{self.card['id']}/").json()
        self.assertEqual([a["nombre"] for a in detalle["adjuntos"]], ["requisitos.pdf"])
        lista = self.cliente(self.lector).get(f"/api/v1/cards/{self.card['id']}/adjuntos/").json()
        self.assertEqual([a["id"] for a in lista], [adjunto["id"]])

        descarga = self.cliente(self.lector).get(f"/api/v1/adjuntos/{adjunto['id']}/")
        self.assertEqual(descarga.status_code, 200)
        self.assertEqual(descarga.content, b"%PDF-1.4 contenido")
        self.assertIn("attachment", descarga["Content-Disposition"])
        self.assertEqual(descarga["X-Content-Type-Options"], "nosniff")

        self.assertEqual(self.cliente(self.beto).delete(f"/api/v1/adjuntos/{adjunto['id']}/").status_code, 204)
        self.assertFalse(Adjunto.objects.exists())
        historial = self.cliente(self.ana).get(f"/api/v1/cards/{self.card['id']}/actividad/").json()
        self.assertEqual(
            [(h["accion"], h["detalle"]) for h in historial[:2]],
            [
                ("adjunto", {"cambio": "quito", "nombre": "requisitos.pdf"}),
                ("adjunto", {"cambio": "agrego", "nombre": "requisitos.pdf"}),
            ],
        )

    def test_un_html_se_descarga_no_se_abre(self):
        adjunto = self.subir("pagina.html", b"<script>alert(1)</script>").json()
        descarga = self.cliente(self.beto).get(f"/api/v1/adjuntos/{adjunto['id']}/")
        self.assertTrue(descarga["Content-Disposition"].startswith("attachment"))
        self.assertEqual(descarga["X-Content-Type-Options"], "nosniff")

    def test_nombre_sin_carpetas_y_limites(self):
        self.assertEqual(self.subir("..\\..\\secreto/plano rev A.dwg").json()["nombre"], "plano rev A.dwg")
        for nombre, datos, parte in (
            ("instalar.exe", b"MZ", "programa"),
            ("script.PS1", b"x", "programa"),
            ("vacio.txt", b"", "vacío"),
        ):
            r = self.subir(nombre, datos)
            self.assertEqual(r.status_code, 400, nombre)
            self.assertIn(parte, str(r.json()), nombre)
        with mock.patch.object(servicio, "MAX_BYTES", 10):
            r = self.subir("grande.pdf", b"12345678901")
            self.assertEqual(r.status_code, 400)
            self.assertIn("pesa más", r.json()["detail"])
        # Una petición que ya anuncia demasiado se rechaza sin llegar a leer el archivo.
        with mock.patch.object(servicio, "MAX_BYTES", 10), mock.patch.object(servicio, "MARGEN_PETICION", 0):
            with mock.patch.object(servicio, "adjuntar") as adjuntar:
                r = self.subir("grande.pdf", b"12345678901")
            self.assertEqual(r.status_code, 400)
            self.assertIn("pesa más", r.json()["detail"])
            adjuntar.assert_not_called()
        with mock.patch.object(servicio, "MAX_POR_TARJETA", 1):
            r = self.subir("otro.pdf")
            self.assertEqual(r.status_code, 400)
            self.assertIn("hasta 1 adjuntos", r.json()["detail"])
        self.assertEqual(self.cliente(self.beto).post(f"/api/v1/cards/{self.card['id']}/adjuntos/", {}, format="multipart").status_code, 400)

    def test_permisos(self):
        adjunto = self.subir().json()
        # Quien solo consulta descarga, pero no sube ni quita; quien no es del equipo, nada.
        self.assertEqual(self.subir(usuario=self.lector).status_code, 403)
        self.assertEqual(self.cliente(self.lector).delete(f"/api/v1/adjuntos/{adjunto['id']}/").status_code, 403)
        self.assertEqual(self.subir(usuario=self.ajeno).status_code, 403)
        self.assertEqual(self.cliente(self.ajeno).get(f"/api/v1/adjuntos/{adjunto['id']}/").status_code, 403)
        self.assertEqual(self.cliente(self.ajeno).get(f"/api/v1/cards/{self.card['id']}/adjuntos/").status_code, 403)
        self.assertEqual(Adjunto.objects.count(), 1)
