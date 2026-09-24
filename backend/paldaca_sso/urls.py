from django.urls import path

from . import views

app_name = "paldaca_sso"

urlpatterns = [
    path("me/", views.me, name="me"),
    path("logout/", views.logout, name="logout"),
    path("resync/", views.resync, name="resync"),
]
