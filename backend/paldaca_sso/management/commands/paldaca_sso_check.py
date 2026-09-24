"""
Diagnóstico manual del backchannel SSO sin pasar por un navegador.

Uso: python manage.py paldaca_sso_check --cookie <valor real de paldaca_sessionid>
"""

from django.core.management.base import BaseCommand, CommandError

from paldaca_sso import conf
from paldaca_sso.client import fetch_me
from paldaca_sso.exceptions import PortalUnauthorized, PortalUnavailable


class Command(BaseCommand):
    help = "Verifica el backchannel SSO contra el Portal usando una cookie real."

    def add_arguments(self, parser):
        parser.add_argument("--cookie", required=True, help="Valor de paldaca_sessionid")

    def handle(self, *args, **options):
        if not conf.enabled():
            raise CommandError("PALDACA_SSO_ENABLED=false — no hay nada que verificar.")

        self.stdout.write(f"Portal API: {conf.portal_api_url()}")
        self.stdout.write(f"Endpoint:   {conf.me_endpoint()}")

        try:
            identity = fetch_me(options["cookie"])
        except PortalUnauthorized as exc:
            raise CommandError(f"Portal respondió negativa autoritativa: {exc}")
        except PortalUnavailable as exc:
            raise CommandError(f"Portal no disponible/respuesta no concluyente: {exc}")

        self.stdout.write(self.style.SUCCESS("OK — identidad resuelta:"))
        self.stdout.write(f"  portal_user_id: {identity.portal_user_id}")
        self.stdout.write(f"  email:          {identity.email}")
        self.stdout.write(f"  rol:            {identity.rol}")
        self.stdout.write(f"  es_superadmin:  {identity.es_superadmin}")
        self.stdout.write(f"  módulos:        {', '.join(identity.modulo_codigos) or '(ninguno)'}")
        tiene_acceso = identity.tiene_modulo(conf.modulo_codigo())
        estilo = self.style.SUCCESS if tiene_acceso else self.style.WARNING
        self.stdout.write(estilo(f"  acceso a '{conf.modulo_codigo()}': {tiene_acceso}"))
