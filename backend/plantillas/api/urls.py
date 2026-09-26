from django.urls import path

from . import views

urlpatterns = [
    path("plantillas/", views.PlantillasView.as_view(), name="plantillas"),
    path("plantillas/<int:pk>/", views.PlantillaDetalleView.as_view(), name="plantilla-detalle"),
    path("plantillas/<int:pk>/usar/", views.UsarPlantillaView.as_view(), name="plantilla-usar"),
]
