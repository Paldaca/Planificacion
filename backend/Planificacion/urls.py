"""
URL configuration for Planificacion project.
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

from .spa import spa_shell


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/", include("paldaca_sso.urls")),
    # API de negocio versionada (docs/plan-modulo-planificacion.md §8).
    path("api/v1/", include("equipos.api.urls")),
    path("api/v1/", include("tableros.api.urls")),
    path("api/v1/", include("calendario.api.urls")),
    path("api/v1/", include("gantt.api.urls")),
    path("api/v1/", include("exportacion.api.urls")),
    # Catch-all: sirve el shell de la SPA para cualquier ruta que no sea
    # /admin/, /api/, /static/ o /assets/ — el ruteo real lo hace React
    # Router del lado del cliente. Debe ser el ÚLTIMO patrón.
    #
    # `assets/` está excluido porque ahí viven los bundles del build de Vite
    # (los sirve WhiteNoise vía WHITENOISE_ROOT). Si el catch-all los
    # capturara, cada .js respondería el index.html con Content-Type
    # text/html: el navegador no ejecuta nada y la SPA queda en blanco sin
    # ningún error visible en el servidor.
    re_path(r"^(?!admin/|api/|static/|assets/).*$", spa_shell, name="spa-shell"),
]
