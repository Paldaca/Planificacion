from django.apps import AppConfig


class CalendarioConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "calendario"
    verbose_name = "Calendario laboral"

    def ready(self):
        from . import signals  # noqa: F401
