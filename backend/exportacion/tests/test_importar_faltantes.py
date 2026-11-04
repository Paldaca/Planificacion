"""Importar con columnas, etiquetas y campos de lista que el tablero no tiene: resumen y creación."""

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook

from tableros.models import CampoPersonalizado, Card, Columna, Etiqueta, Tablero
from tableros.services.campos import MAX_OPCIONES, crear_campo
from tableros.services.etiquetas import MAX_ETIQUETAS, crear_etiqueta

from .test_exportacion import Base


def plantilla_llena(filas):
    libro = Workbook()
    hoja = libro.active
    hoja.title = "Tarjetas"
    hoja.append(["#", "Título", "Columna", "Urgencia", "Responsables", "Inicio", "Fin", "Depende de", "Descripción", "Etiquetas"])
    for fila in filas:
        hoja.append(fila)
    salida = io.BytesIO()
    libro.save(salida)
    return salida.getvalue()

# «#», título, columna, urgencia, responsables, inicio, fin, depende, descripción, etiquetas
ARCHIVO = [
    [1, "Levantamiento", "Pendientes", "", "", "", "", "", "", "Fase 1, Civil"],
    [2, "Planos", "En revisión", "", "", "01/04/2026", "03/04/2026", "1", "", "Fase 1, civil"],
    [3, "Informe", "Hecho", "", "", "06/04/2026", "06/04/2026", "2", "", "Fase 2"],
]


class FaltantesTests(Base):
    def importar_con(self, confirmar=False, usuario=None, **crear):
        cuerpo = {k: "true" for k, v in crear.items() if v}
        return self.importar_archivo(plantilla_llena(ARCHIVO), confirmar=confirmar, usuario=usuario, extra=cuerpo)

    def importar_archivo(self, datos, confirmar=False, usuario=None, extra=None):
        cuerpo = {"archivo": SimpleUploadedFile("plan.xlsx", datos), **(extra or {})}
        if confirmar:
            cuerpo["confirmar"] = "true"
        with self.captureOnCommitCallbacks(execute=True):
            return self.cliente(usuario or self.ana).post(
                f"/api/v1/tableros/{self.tablero['id']}/importar/", cuerpo, format="multipart"
            )

    def columnas(self):
        return list(Columna.objects.filter(tablero_id=self.tablero["id"], archivada=False).order_by("orden"))

    def test_resumen_sin_repetir_y_sin_avisos_por_fila(self):
        datos = self.importar_con().json()
        # «civil» y «Civil» son la misma; la columna «Hecho» ya existe.
        self.assertEqual(datos["faltantes"]["columnas"], ["Pendientes", "En revisión"])
        self.assertEqual(datos["faltantes"]["etiquetas"], ["Fase 1", "Civil", "Fase 2"])
        self.assertEqual(datos["faltantes"]["primera_columna"], "Tareas")
        self.assertTrue(datos["puede_crear"])
        self.assertEqual([f["avisos"] for f in datos["filas"]], [[], [], []])
        self.assertEqual(datos["filas"][0]["columna"], "Tareas")
        self.assertEqual(datos["filas"][0]["etiquetas"], [])

    def test_vista_previa_con_crear_muestra_lo_nuevo_sin_guardar(self):
        datos = self.importar_con(crear_columnas=True, crear_etiquetas=True).json()
        fila = datos["filas"][0]
        self.assertEqual((fila["columna"], fila["columna_nueva"]), ("Pendientes", True))
        self.assertEqual(fila["etiquetas_nuevas"], ["Fase 1", "Civil"])
        self.assertEqual(len(self.columnas()), 3)
        self.assertFalse(Etiqueta.objects.filter(tablero_id=self.tablero["id"]).exists())

    def test_importar_crea_columnas_antes_de_la_final_y_etiquetas(self):
        antes = Card.objects.count()
        r = self.importar_con(confirmar=True, crear_columnas=True, crear_etiquetas=True)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["columnas_creadas"], ["Pendientes", "En revisión"])
        self.assertEqual(r.json()["etiquetas_creadas"], ["Fase 1", "Civil", "Fase 2"])
        columnas = self.columnas()
        self.assertEqual([c.nombre for c in columnas], ["Tareas", "En curso", "Pendientes", "En revisión", "Hecho"])
        # No se adivina por el nombre: todas las nuevas entran en el Gantt y no son finales.
        nuevas = [c for c in columnas if c.nombre in ("Pendientes", "En revisión")]
        self.assertTrue(all(c.incluir_en_gantt and not c.es_final for c in nuevas))
        colores = set(Etiqueta.objects.filter(tablero_id=self.tablero["id"]).values_list("color", flat=True))
        self.assertEqual(len(colores), 3)
        cards = {c.titulo: c for c in Card.objects.filter(tablero_id=self.tablero["id"]).prefetch_related("etiquetas")}
        self.assertEqual(Card.objects.count(), antes + 3)
        self.assertEqual(cards["Levantamiento"].columna.nombre, "Pendientes")
        self.assertEqual(sorted(e.nombre for e in cards["Planos"].etiquetas.all()), ["Civil", "Fase 1"])

    def test_solo_etiquetas(self):
        r = self.importar_con(confirmar=True, crear_etiquetas=True)
        self.assertEqual(r.json()["columnas_creadas"], [])
        self.assertEqual(len(self.columnas()), 3)
        cards = {c.titulo: c for c in Card.objects.filter(tablero_id=self.tablero["id"])}
        self.assertEqual(cards["Levantamiento"].columna.nombre, "Tareas")

    def test_sin_permiso_de_gestionar_no_se_crea(self):
        """Beto es miembro: importa tarjetas, pero no crea columnas ni etiquetas."""
        previa = self.importar_con(usuario=self.beto).json()
        self.assertFalse(previa["puede_crear"])
        r = self.importar_con(confirmar=True, usuario=self.beto, crear_columnas=True)
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.importar_con(confirmar=True, usuario=self.beto).status_code, 201)

    def test_mas_etiquetas_que_el_cupo_no_crea_nada(self):
        tablero = Tablero.objects.get(pk=self.tablero["id"])
        for i in range(MAX_ETIQUETAS - 1):
            crear_etiqueta(tablero, nombre=f"E{i}", color="#2563eb")
        antes = Card.objects.count()
        previa = self.importar_con(crear_etiquetas=True).json()
        self.assertTrue(previa["problemas"])
        r = self.importar_con(confirmar=True, crear_etiquetas=True, crear_columnas=True)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Card.objects.count(), antes)
        self.assertEqual(len(self.columnas()), 3)  # tampoco quedan columnas a medias


def excel_campos(encabezados, filas):
    libro = Workbook()
    hoja = libro.active
    hoja.title = "Tarjetas"
    hoja.append(encabezados)
    for fila in filas:
        hoja.append(fila)
    salida = io.BytesIO()
    libro.save(salida)
    return salida.getvalue()


# «Fase» y «Frente» parecen listas; «Horas» es un número y «Vencimiento» es
# una columna informativa del Excel exportado: nunca se ofrecen.
CON_CAMPOS = excel_campos(
    ["#", "Título", "Fase", "Frente", "Horas", "Vencimiento"],
    [
        [1, "Repositorios", "F0 · Entorno", "A", 4, "Al día"],
        [2, "Servidor", "F0 · Entorno", "A", 8, "Vencida"],
        [3, "Modelos", "F2 · Identidad", "B", 6, "Al día"],
        [4, "Pendiente sin fase", "", "A", None, ""],
    ],
)


class CamposFaltantesTests(Base):
    """Campos de lista que el archivo usa: se crean, o se les agregan las opciones."""

    def importar_campos(self, confirmar=False, usuario=None, **extra):
        cuerpo = {"archivo": SimpleUploadedFile("plan.xlsx", CON_CAMPOS)}
        cuerpo |= {k: ("true" if v is True else v) for k, v in extra.items() if v}
        if confirmar:
            cuerpo["confirmar"] = "true"
        with self.captureOnCommitCallbacks(execute=True):
            return self.cliente(usuario or self.ana).post(
                f"/api/v1/tableros/{self.tablero['id']}/importar/", cuerpo, format="multipart"
            )

    def campo(self, nombre):
        return CampoPersonalizado.objects.get(tablero_id=self.tablero["id"], nombre=nombre, archivado=False)

    def fase_de(self, titulo):
        card = Card.objects.get(tablero_id=self.tablero["id"], titulo=titulo)
        return (card.campos or {}).get(str(self.campo("Fase").pk))

    def test_resumen_solo_ofrece_columnas_de_texto(self):
        campos = self.importar_campos().json()["faltantes"]["campos"]
        self.assertEqual(
            campos,
            [
                {"nombre": "Fase", "opciones": ["F0 · Entorno", "F2 · Identidad"], "existe": False},
                {"nombre": "Frente", "opciones": ["A", "B"], "existe": False},
            ],
        )

    def test_crea_el_campo_de_lista_en_el_orden_del_archivo(self):
        r = self.importar_campos(confirmar=True, crear_campos=True)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["campos_creados"], ["Fase", "Frente"])
        fase = self.campo("Fase")
        self.assertEqual((fase.tipo, fase.opciones, fase.visible_en_tarjeta), ("lista", ["F0 · Entorno", "F2 · Identidad"], True))
        self.assertEqual(self.fase_de("Servidor"), "F0 · Entorno")
        self.assertIsNone(self.fase_de("Pendiente sin fase"))
        self.assertFalse(CampoPersonalizado.objects.filter(tablero_id=self.tablero["id"], nombre="Vencimiento").exists())

    def test_omitir_un_campo(self):
        r = self.importar_campos(confirmar=True, crear_campos=True, omitir_campos=["frente"])
        self.assertEqual(r.json()["campos_creados"], ["Fase"])
        self.assertFalse(CampoPersonalizado.objects.filter(tablero_id=self.tablero["id"], nombre="Frente").exists())

    def test_agrega_las_opciones_que_le_faltan_a_un_campo_existente(self):
        tablero = Tablero.objects.get(pk=self.tablero["id"])
        crear_campo(tablero, nombre="Fase", tipo="lista", opciones=["F2 · Identidad", "Cierre"])
        sin_crear = self.importar_campos().json()
        self.assertEqual(sin_crear["faltantes"]["campos"][0], {"nombre": "Fase", "opciones": ["F0 · Entorno"], "existe": True})
        self.assertTrue(any("no es una opción" in a for a in sin_crear["filas"][0]["avisos"]))
        con_crear = self.importar_campos(crear_campos=True, omitir_campos=["Frente"]).json()
        self.assertEqual(con_crear["filas"][0]["avisos"], [])
        self.importar_campos(confirmar=True, crear_campos=True, omitir_campos=["Frente"])
        self.assertEqual(self.campo("Fase").opciones, ["F2 · Identidad", "Cierre", "F0 · Entorno"])
        self.assertEqual(self.fase_de("Repositorios"), "F0 · Entorno")
        self.assertEqual(self.fase_de("Modelos"), "F2 · Identidad")

    def test_sin_crear_no_cambia_nada(self):
        self.importar_campos(confirmar=True)
        self.assertFalse(CampoPersonalizado.objects.filter(tablero_id=self.tablero["id"]).exists())

    def test_sin_permiso_de_gestionar_no_crea_campos(self):
        self.assertEqual(self.importar_campos(confirmar=True, usuario=self.beto, crear_campos=True).status_code, 403)

    def test_mas_opciones_que_el_maximo_no_crea_nada(self):
        tablero = Tablero.objects.get(pk=self.tablero["id"])
        crear_campo(tablero, nombre="Fase", tipo="lista", opciones=[f"O{i}" for i in range(MAX_OPCIONES - 1)])
        antes = Card.objects.count()
        self.assertTrue(self.importar_campos(crear_campos=True).json()["problemas"])
        self.assertEqual(self.importar_campos(confirmar=True, crear_campos=True).status_code, 400)
        self.assertEqual(Card.objects.count(), antes)
