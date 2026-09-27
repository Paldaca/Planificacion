from django.test import SimpleTestCase, override_settings

from Planificacion.spa import con_config


class ConfigSpaTests(SimpleTestCase):
    @override_settings(PALDACA_PORTAL_URL="http://localhost:5173")
    def test_la_url_del_portal_sale_de_settings(self):
        html = con_config("<html><head><title>x</title></head><body></body></html>")
        self.assertIn('<meta name="paldaca-portal-url" content="http://localhost:5173"></head>', html)

    @override_settings(PALDACA_PORTAL_URL='https://x.com/"><script>')
    def test_se_escapa(self):
        self.assertNotIn("<script>", con_config("<head></head>"))
