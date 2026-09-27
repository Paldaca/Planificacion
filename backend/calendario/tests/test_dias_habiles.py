"""Días hábiles: fines de semana, feriados fijos, móviles (Pascua) y puntuales."""

import datetime

from django.test import override_settings

from calendario.models import Feriado
from calendario.services import dias_habiles as dh
from core.testing import ApiTestCase

D = datetime.date


class PascuaTests(ApiTestCase):
    def test_pascua_de_anios_conocidos(self):
        self.assertEqual(dh.pascua(2024), D(2024, 3, 31))
        self.assertEqual(dh.pascua(2025), D(2025, 4, 20))
        self.assertEqual(dh.pascua(2026), D(2026, 4, 5))

    def test_moviles_2026(self):
        self.assertEqual(
            [f for f, _ in dh.feriados_moviles(2026)],
            [D(2026, 2, 16), D(2026, 2, 17), D(2026, 4, 2), D(2026, 4, 3)],
        )


class FeriadosDelAnioTests(ApiTestCase):
    def test_incluye_nacionales_y_moviles(self):
        fechas = {x["fecha"]: x["tipo"] for x in dh.feriados_del_anio(2026)}
        self.assertEqual(fechas[D(2026, 7, 5)], "fijo")
        self.assertEqual(fechas[D(2026, 12, 25)], "fijo")
        self.assertEqual(fechas[D(2026, 2, 16)], "movil")
        self.assertEqual(fechas[D(2026, 4, 3)], "movil")

    @override_settings(CALENDARIO_FERIADOS_MOVILES=False)
    def test_moviles_se_pueden_apagar(self):
        tipos = {x["tipo"] for x in dh.feriados_del_anio(2026)}
        self.assertNotIn("movil", tipos)

    def test_un_feriado_nuevo_invalida_la_cache(self):
        viernes = D(2026, 10, 2)
        self.assertTrue(dh.es_habil(viernes))
        Feriado.objects.create(fecha=viernes, nombre="Puente")
        self.assertFalse(dh.es_habil(viernes))
        Feriado.objects.filter(fecha=viernes).delete()
        self.assertTrue(dh.es_habil(viernes))


class DiasHabilesTests(ApiTestCase):
    def test_saltan_fin_de_semana(self):
        viernes = D(2026, 9, 25)
        self.assertEqual(dh.dias_habiles_hasta(viernes, D(2026, 9, 28)), 1)  # lunes
        self.assertEqual(dh.dias_habiles_hasta(viernes, viernes), 0)

    def test_saltan_semana_santa(self):
        miercoles = D(2026, 4, 1)  # jueves 2 y viernes 3 son feriado
        self.assertEqual(dh.dias_habiles_hasta(miercoles, D(2026, 4, 6)), 1)
        self.assertEqual(dh.sumar_habiles(miercoles, 1), D(2026, 4, 6))
        self.assertEqual(dh.sumar_habiles(D(2026, 4, 6), -1), miercoles)

    def test_duracion_y_fin(self):
        self.assertEqual(dh.fin_desde_inicio(D(2026, 4, 1), 3), D(2026, 4, 7))
        self.assertEqual(dh.duracion_habil(D(2026, 4, 1), D(2026, 4, 7)), 3)
        # Empezar en día no hábil corre el inicio al siguiente hábil.
        self.assertEqual(dh.fin_desde_inicio(D(2026, 4, 4), 1), D(2026, 4, 6))
        self.assertEqual(dh.duracion_habil(D(2026, 4, 4), D(2026, 4, 4)), 1)

    def test_conteo_sin_recorrer_coincide_con_contar_dia_a_dia(self):
        # El conteo aritmético (lunes a viernes menos feriados) debe dar lo
        # mismo que recorrer los días, cruzando años, Carnaval y Semana Santa.
        Feriado.objects.create(fecha=D(2026, 12, 28), nombre="Puente", recurrente=False)

        def dia_a_dia(desde, hasta):
            n, d = 0, desde
            while d < hasta:
                d += datetime.timedelta(days=1)
                n += dh.es_habil(d)
            return n

        base = D(2025, 12, 20)
        for inicio in range(0, 90, 7):
            for largo in (-3, 0, 1, 4, 6, 13, 45, 120, 400):
                desde = base + datetime.timedelta(days=inicio)
                hasta = desde + datetime.timedelta(days=largo)
                with self.subTest(desde=desde, hasta=hasta):
                    self.assertEqual(dh.dias_habiles_hasta(desde, hasta), dia_a_dia(desde, hasta))


class FeriadosApiTests(ApiTestCase):
    URL = "/api/v1/calendario/feriados/"

    def setUp(self):
        super().setUp()
        from core.testing import crear_usuario

        self.persona = crear_usuario("ana")
        self.jefa = crear_usuario("jefa", rol="administrador")

    def test_cualquiera_consulta(self):
        r = self.cliente(self.persona).get(self.URL, {"desde": "2026-04-01", "hasta": "2026-04-30"})
        self.assertEqual(r.status_code, 200)
        dias = {x["fecha"]: x for x in r.json()}
        self.assertFalse(dias["2026-04-03"]["editable"])  # móvil: calculado
        self.assertTrue(dias["2026-04-19"]["editable"])  # nacional guardado

    def test_rango_invalido(self):
        r = self.cliente(self.persona).get(self.URL, {"desde": "2026-01-01", "hasta": "2029-01-01"})
        self.assertEqual(r.status_code, 400)

    def test_solo_el_admin_del_modulo_edita(self):
        datos = {"fecha": "2026-10-02", "nombre": "Puente"}
        self.assertEqual(self.cliente(self.persona).post(self.URL, datos, format="json").status_code, 403)
        r = self.cliente(self.jefa).post(self.URL, datos, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.cliente(self.jefa).post(self.URL, datos, format="json").status_code, 400)
        self.assertEqual(self.cliente(self.persona).delete(f"{self.URL}{r.json()['id']}/").status_code, 403)
        self.assertEqual(self.cliente(self.jefa).delete(f"{self.URL}{r.json()['id']}/").status_code, 204)

    def test_recurrente_se_guarda_sin_anio(self):
        r = self.cliente(self.jefa).post(
            self.URL, {"fecha": "2026-11-15", "nombre": "Aniversario", "recurrente": True}, format="json"
        )
        self.assertEqual(r.json()["fecha"], "2000-11-15")
        self.assertFalse(dh.es_habil(D(2027, 11, 15)))  # lunes, pero feriado
