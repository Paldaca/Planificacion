from django.urls import path

from . import views

urlpatterns = [
    path("tableros/", views.TablerosView.as_view(), name="tableros"),
    path("tableros/<int:pk>/", views.TableroDetalleView.as_view(), name="tablero-detalle"),
    path("tableros/<int:pk>/archivar/", views.TableroArchivarView.as_view(), name="tablero-archivar"),
    path(
        "tableros/<int:pk>/archivadas/",
        views.TableroCardsArchivadasView.as_view(),
        name="tablero-archivadas",
    ),
    path("tableros/<int:pk>/columnas/", views.ColumnasView.as_view(), name="tablero-columnas"),
    path(
        "tableros/<int:pk>/columnas/reordenar/",
        views.ColumnasReordenarView.as_view(),
        name="tablero-columnas-reordenar",
    ),
    path("tableros/<int:pk>/cards/", views.CardsView.as_view(), name="tablero-cards"),
    path(
        "tableros/<int:pk>/cards/<int:numero>/",
        views.CardPorNumeroView.as_view(),
        name="tablero-card-numero",
    ),
    path("columnas/<int:pk>/", views.ColumnaDetalleView.as_view(), name="columna-detalle"),
    path("columnas/<int:pk>/archivar/", views.ColumnaArchivarView.as_view(), name="columna-archivar"),
    path("cards/<int:pk>/", views.CardDetalleView.as_view(), name="card-detalle"),
    path("cards/<int:pk>/mover/", views.CardMoverView.as_view(), name="card-mover"),
    path("cards/<int:pk>/archivar/", views.CardArchivarView.as_view(), name="card-archivar"),
    path("cards/<int:pk>/comentarios/", views.ComentariosView.as_view(), name="card-comentarios"),
    path("comentarios/<int:pk>/", views.ComentarioDetalleView.as_view(), name="comentario-detalle"),
    path("mis-tareas/", views.MisTareasView.as_view(), name="mis-tareas"),
]
