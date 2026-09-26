from django.urls import path

from . import views

urlpatterns = [
    path("tableros/<int:pk>/exportar/", views.ExportarView.as_view(), name="tablero-exportar"),
    path("tableros/<int:pk>/importar/", views.ImportarView.as_view(), name="tablero-importar"),
    path("tableros/<int:pk>/importar/plantilla/", views.PlantillaView.as_view(), name="tablero-importar-plantilla"),
]
