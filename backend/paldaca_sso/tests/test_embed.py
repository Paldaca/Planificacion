"""
Smoke tests del contrato `paldaca-embed` v1 y del gateo de `/api/*` por
`PaldacaSsoBootstrapMiddleware`. Adaptado del patrón de
`ActivosPALDACA/core/test_embed.py` a un backend API-only.
"""

from django.test import Client, TestCase, override_settings
from django.urls import Resolver404, resolve


class EmbedHeadersTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_csp_frame_ancestors_presente_en_shell(self):
        response = self.client.get("/")
        self.assertIn("Content-Security-Policy", response)
        self.assertIn("frame-ancestors", response["Content-Security-Policy"])

    def test_sin_x_frame_options(self):
        response = self.client.get("/")
        self.assertNotIn("X-Frame-Options", response)

    def test_health_endpoint_publico(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)

    def test_assets_del_build_no_los_absorbe_el_catch_all(self):
        """Los bundles de Vite (`/assets/*`) los sirve WhiteNoise.

        Si el catch-all los capturara, cada .js respondería el index.html con
        Content-Type text/html: el navegador no ejecuta nada y la SPA queda
        en blanco dentro del iframe, sin un solo error en el servidor. Pasó
        de verdad, así que queda cubierto.
        """
        for ruta in ("/assets/index-abc123.js", "/assets/index-abc123.css"):
            with self.subTest(ruta=ruta):
                with self.assertRaises(Resolver404):
                    resolve(ruta)

    def test_rutas_de_cliente_si_las_sirve_el_catch_all(self):
        self.assertEqual(resolve("/proyectos/42").view_name, "spa-shell")


@override_settings(PALDACA_SSO_ENABLED=False)
class SsoDeployDarkTests(TestCase):
    """Con PALDACA_SSO_ENABLED=false (default), el middleware no debe actuar."""

    def test_me_no_gateado_por_falta_de_cookie_pero_responde_401_por_anonimo(self):
        # El middleware devuelve la petición sin tocar (deploy dark); la vista
        # `me` es la que responde 401 porque no hay usuario autenticado.
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)


@override_settings(PALDACA_SSO_ENABLED=True, PALDACA_PORTAL_API_URL="http://portal.invalido.test")
class SsoGatingTests(TestCase):
    """Con SSO activo, /api/* sin cookie del Portal debe cortar en 401 ANTES
    de llegar a la vista (el middleware nunca intenta el backchannel)."""

    def test_api_sin_cookie_portal_devuelve_401_sin_llamar_al_portal(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["reason"], "no_portal_cookie")

    def test_ruta_no_api_no_se_gatea(self):
        # El shell de la SPA debe cargar SIEMPRE, con o sin sesión — es React
        # quien decide qué pantalla mostrar llamando a /api/auth/me/.
        response = self.client.get("/cualquier-ruta-del-front")
        self.assertEqual(response.status_code, 200)

    def test_health_sigue_publico_con_sso_activo(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
