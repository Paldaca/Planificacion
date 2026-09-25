from django.urls import path

from . import views

urlpatterns = [
    path("calendario/feriados/", views.FeriadosView.as_view(), name="feriados"),
    path("calendario/feriados/<int:pk>/", views.FeriadoDetalleView.as_view(), name="feriado-detalle"),
]
