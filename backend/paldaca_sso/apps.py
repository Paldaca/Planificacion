from django.apps import AppConfig


class PaldacaSsoConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "paldaca_sso"
    verbose_name = "SSO federado (Portal PALDACA)"

    def ready(self):
        from . import checks  # noqa: F401 -- registra los system checks al importarse
