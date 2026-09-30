"""Adjuntos de una tarjeta: subir, listar, descargar, quitar, límites y permisos."""

import io
from unittest import mock

from PIL import Image

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
        self.assertFalse(adjunto["es_imagen"])
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

    def test_una_imagen_se_muestra_en_linea_y_lo_demas_no(self):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
        webp = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 20
        casos = [
            ("captura.PNG", png, "image/png", True),
            ("foto.webp", webp, "image/webp", True),
            ("foto.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 20, "image/jpeg", True),
            # Dice ser una imagen y es una página: se guarda como un archivo cualquiera.
            ("falsa.png", b"<html><script>alert(1)</script></html>", "application/octet-stream", False),
            ("dibujo.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml", False),
            ("acta.docx", b"PK\x03\x04 documento", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", False),
        ]
        for nombre, datos, tipo, imagen in casos:
            with self.subTest(nombre=nombre):
                adjunto = self.subir(nombre, datos).json()
                self.assertEqual((adjunto["tipo"], adjunto["es_imagen"]), (tipo, imagen))
                ver = self.cliente(self.lector).get(f"/api/v1/adjuntos/{adjunto['id']}/?ver=1")
                self.assertEqual(ver.status_code, 200)
                self.assertEqual(ver["Content-Disposition"].split(";")[0], "inline" if imagen else "attachment")
                self.assertEqual(ver["X-Content-Type-Options"], "nosniff")
                self.assertEqual("sandbox" in ver.get("Content-Security-Policy", ""), imagen)
                # Sin `ver`, siempre como descarga.
                descarga = self.cliente(self.lector).get(f"/api/v1/adjuntos/{adjunto['id']}/")
                self.assertTrue(descarga["Content-Disposition"].startswith("attachment"))
        # Ver una imagen pide el mismo permiso que descargarla.
        primera = Adjunto.objects.sin_contenido().first()
        self.assertEqual(self.cliente(self.ajeno).get(f"/api/v1/adjuntos/{primera.pk}/?ver=1").status_code, 403)

    def test_la_tarjeta_del_tablero_trae_cuantos_adjuntos_tiene_y_su_portada(self):
        def en_tablero():
            detalle = self.cliente(self.lector).get(f"/api/v1/tableros/{self.tablero['id']}/").json()
            card = next(c for c in detalle["cards"] if c["id"] == self.card["id"])
            return card["num_adjuntos"], card["portada"]

        self.assertEqual(en_tablero(), (0, None))
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
        self.subir("acta.docx", b"PK\x03\x04 documento")
        self.assertEqual(en_tablero(), (1, None))  # un Word no es portada
        primera = self.subir("pantalla.png", png).json()
        segunda = self.subir("otra.png", png + b"").json()  # otra imagen: la misma no se repite
        self.assertEqual(en_tablero(), (3, primera["id"]))
        self.cliente(self.beto).delete(f"/api/v1/adjuntos/{primera['id']}/")
        self.assertEqual(en_tablero(), (2, segunda["id"]))
        # Fuera del listado del tablero (sin `con_detalle`) sale lo mismo.
        r = self.cliente(self.beto).patch(
            f"/api/v1/cards/{self.card['id']}/", {"titulo": "Otro título", "version": self.card["version"]}, format="json"
        )
        self.assertEqual((r.json()["num_adjuntos"], r.json()["portada"]), (2, segunda["id"]))

    def test_las_imagenes_del_modelo_son_las_que_tienen_firma(self):
        from tableros.models import TIPOS_IMAGEN

        self.assertEqual(set(servicio.FIRMAS_IMAGEN), set(TIPOS_IMAGEN))

    def imagen(self, formato="PNG", tamano=(3000, 2000), modo="RGB"):
        salida = io.BytesIO()
        Image.new(modo, tamano, (50, 64, 123) if modo == "RGB" else (50, 64, 123, 128)).save(salida, formato)
        return salida.getvalue()

    def test_las_imagenes_se_reducen_y_tienen_miniatura(self):
        grande = self.imagen("JPEG")
        adjunto = self.subir("foto.jpg", grande).json()
        guardado = Adjunto.objects.get(pk=adjunto["id"])
        with Image.open(io.BytesIO(bytes(guardado.contenido))) as im:
            self.assertEqual((im.format, im.size), ("JPEG", (1920, 1280)))
        self.assertEqual(adjunto["tamano"], len(bytes(guardado.contenido)))
        mini = self.cliente(self.lector).get(f"/api/v1/adjuntos/{adjunto['id']}/?ver=miniatura")
        self.assertEqual((mini.status_code, mini["Content-Type"]), (200, "image/jpeg"))
        self.assertTrue(mini["Content-Disposition"].startswith("inline"))
        with Image.open(io.BytesIO(mini.content)) as im:
            self.assertEqual(im.size, (480, 320))
        # La huella es la del original: volver a elegirlo se rechaza aunque lo guardado sea otro.
        self.assertEqual(self.subir("foto.jpg", grande).status_code, 400)

        # PNG con transparencia: sigue siendo PNG; la miniatura, JPEG sobre blanco.
        png = self.subir("captura.png", self.imagen("PNG", (2400, 1200), "RGBA")).json()
        with Image.open(io.BytesIO(bytes(Adjunto.objects.get(pk=png["id"]).contenido))) as im:
            self.assertEqual((im.format, im.size, im.mode), ("PNG", (1920, 960), "RGBA"))
        # Pequeña: no se toca. GIF: tal cual (puede ser animado), con miniatura.
        chica = self.imagen("PNG", (800, 600))
        self.assertEqual(bytes(Adjunto.objects.get(pk=self.subir("chica.png", chica).json()["id"]).contenido), chica)
        gif = self.imagen("GIF", (2500, 2500))
        guardado_gif = Adjunto.objects.get(pk=self.subir("anim.gif", gif).json()["id"])
        self.assertEqual((bytes(guardado_gif.contenido), guardado_gif.miniatura is not None), (gif, True))

    def test_una_imagen_que_pillow_no_lee_se_guarda_sin_miniatura(self):
        rota = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
        adjunto = self.subir("rota.png", rota).json()
        self.assertEqual((adjunto["tipo"], adjunto["es_imagen"]), ("image/png", True))
        self.assertIsNone(Adjunto.objects.get(pk=adjunto["id"]).miniatura)
        # Sin miniatura, `?ver=miniatura` sirve la imagen tal cual.
        r = self.cliente(self.beto).get(f"/api/v1/adjuntos/{adjunto['id']}/?ver=miniatura")
        self.assertEqual((r.status_code, r.content), (200, rota))

    def test_demasiados_pixeles_se_rechaza(self):
        with mock.patch.object(servicio, "MAX_PIXELES", 100):
            r = self.subir("enorme.png", self.imagen("PNG", (20, 20)))
        self.assertEqual(r.status_code, 400)
        self.assertIn("píxeles", r.json()["detail"])

    def test_el_mismo_archivo_no_se_adjunta_dos_veces(self):
        png = b"\x89PNG\r\n\x1a\n" + b"\x01" * 30
        self.assertEqual(self.subir("plano.png", png).status_code, 201)
        # Elegido otra vez, o con otro nombre (una captura pegada): se rechaza.
        for nombre in ("plano.png", "Captura 2026-09-30 10.00.00.png"):
            r = self.subir(nombre, png)
            self.assertEqual(r.status_code, 400, nombre)
            self.assertIn("ya está adjunto", r.json()["detail"])
        # Mismo tamaño y distinto contenido sí entra; y en otra tarjeta, también.
        self.assertEqual(self.subir("plano-b.png", b"\x89PNG\r\n\x1a\n" + b"\x02" * 30).status_code, 201)
        otra = self.crear_card(titulo="Otra")
        self.assertEqual(self.subir("plano.png", png, card=otra).status_code, 201)
        self.assertEqual(Adjunto.objects.filter(card_id=self.card["id"]).count(), 2)

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
