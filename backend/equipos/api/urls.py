from django.urls import path

from . import views

urlpatterns = [
    path("equipos/", views.EquiposView.as_view(), name="equipos"),
    path("equipos/<int:pk>/", views.EquipoDetalleView.as_view(), name="equipo-detalle"),
    path("equipos/<int:pk>/archivar/", views.EquipoArchivarView.as_view(), name="equipo-archivar"),
    path("equipos/<int:pk>/miembros/", views.MiembrosView.as_view(), name="equipo-miembros"),
    path(
        "equipos/<int:pk>/miembros/<int:miembro_pk>/",
        views.MiembroDetalleView.as_view(),
        name="equipo-miembro",
    ),
    path("equipos/<int:pk>/salir/", views.SalirEquipoView.as_view(), name="equipo-salir"),
    path(
        "equipos/<int:pk>/invitaciones/",
        views.InvitacionesEquipoView.as_view(),
        name="equipo-invitaciones",
    ),
    path("personas/", views.PersonasView.as_view(), name="personas"),
    path("invitaciones/", views.MisInvitacionesView.as_view(), name="mis-invitaciones"),
    path(
        "invitaciones/<int:pk>/aceptar/",
        views.ResponderInvitacionView.as_view(aceptar=True),
        name="invitacion-aceptar",
    ),
    path(
        "invitaciones/<int:pk>/rechazar/",
        views.ResponderInvitacionView.as_view(aceptar=False),
        name="invitacion-rechazar",
    ),
    path(
        "invitaciones/<int:pk>/cancelar/",
        views.InvitacionCancelarView.as_view(),
        name="invitacion-cancelar",
    ),
]
