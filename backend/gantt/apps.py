from django.apps import AppConfig


class GanttConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "gantt"
    verbose_name = "Gantt"

    def ready(self):
        from . import receivers  # noqa: F401
