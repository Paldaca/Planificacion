from django.urls import path

from .views import adjuntos, checklist, columnas, comentarios, configuracion, mis_tareas, tableros, tarjetas

urlpatterns = [
    # Tableros
    path("tableros/", tableros.TablerosView.as_view(), name="tableros"),
    path("tableros/<int:pk>/", tableros.TableroDetalleView.as_view(), name="tablero-detalle"),
    path("tableros/<int:pk>/archivar/", tableros.TableroArchivarView.as_view(), name="tablero-archivar"),
    path("tableros/<int:pk>/favorito/", tableros.TableroFavoritoView.as_view(), name="tablero-favorito"),
    path("tableros/<int:pk>/archivadas/", tableros.TableroCardsArchivadasView.as_view(), name="tablero-archivadas"),
    path("equipos/<int:pk>/tableros/", tableros.EquipoTablerosView.as_view(), name="equipo-tableros"),
    # Columnas
    path("tableros/<int:pk>/columnas/", columnas.ColumnasView.as_view(), name="tablero-columnas"),
    path(
        "tableros/<int:pk>/columnas/reordenar/",
        columnas.ColumnasReordenarView.as_view(),
        name="tablero-columnas-reordenar",
    ),
    path("columnas/<int:pk>/", columnas.ColumnaDetalleView.as_view(), name="columna-detalle"),
    path("columnas/<int:pk>/archivar/", columnas.ColumnaArchivarView.as_view(), name="columna-archivar"),
    # Tarjetas
    path("tableros/<int:pk>/cards/", tarjetas.CardsView.as_view(), name="tablero-cards"),
    path("tableros/<int:pk>/cards/<int:numero>/", tarjetas.CardPorNumeroView.as_view(), name="tablero-card-numero"),
    path("cards/<int:pk>/", tarjetas.CardDetalleView.as_view(), name="card-detalle"),
    path("cards/<int:pk>/mover/", tarjetas.CardMoverView.as_view(), name="card-mover"),
    path("cards/<int:pk>/archivar/", tarjetas.CardArchivarView.as_view(), name="card-archivar"),
    path("cards/<int:pk>/trasladar/", tarjetas.CardTrasladarView.as_view(), name="card-trasladar"),
    path("cards/<int:pk>/actividad/", tarjetas.ActividadView.as_view(), name="card-actividad"),
    # Checklist y comentarios
    path("cards/<int:pk>/checklist/", checklist.ChecklistView.as_view(), name="card-checklist"),
    path("checklist/<int:pk>/", checklist.ItemChecklistView.as_view(), name="checklist-item"),
    path("cards/<int:pk>/comentarios/", comentarios.ComentariosView.as_view(), name="card-comentarios"),
    path("comentarios/<int:pk>/", comentarios.ComentarioDetalleView.as_view(), name="comentario-detalle"),
    # Adjuntos de una tarjeta
    path("cards/<int:pk>/adjuntos/", adjuntos.AdjuntosView.as_view(), name="card-adjuntos"),
    path("adjuntos/<int:pk>/", adjuntos.AdjuntoDetalleView.as_view(), name="adjunto-detalle"),
    # Configuración del tablero (fase 5): etiquetas y campos personalizados
    path("tableros/<int:pk>/etiquetas/", configuracion.EtiquetasView.as_view(), name="tablero-etiquetas"),
    path("etiquetas/<int:pk>/", configuracion.EtiquetaDetalleView.as_view(), name="etiqueta-detalle"),
    path("tableros/<int:pk>/campos/", configuracion.CamposView.as_view(), name="tablero-campos"),
    path("campos/<int:pk>/", configuracion.CampoDetalleView.as_view(), name="campo-detalle"),
    # Mis tareas
    path("mis-tareas/", mis_tareas.MisTareasView.as_view(), name="mis-tareas"),
]
