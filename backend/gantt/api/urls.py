from django.urls import path

from . import views

urlpatterns = [
    path("tableros/<int:pk>/dependencias/", views.DependenciasView.as_view(), name="tablero-dependencias"),
    path("dependencias/<int:pk>/", views.DependenciaDetalleView.as_view(), name="dependencia-detalle"),
    path("cards/<int:pk>/programar/", views.ProgramarView.as_view(), name="card-programar"),
]
