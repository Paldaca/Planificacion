"""API de plantillas (`/api/v1/plantillas/`)."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from equipos.models import Equipo
from equipos.permisos import puede_administrar_equipo
from integracion_portal.services.personas import nombre as nombre_persona
from plantillas import permisos
from plantillas.models import AlcancePlantilla, Plantilla
from plantillas.services import plantillas as servicio
from tableros.api.views.comunes import obtener_tablero


class PlantillaSerializer(serializers.ModelSerializer):
    equipo = serializers.SerializerMethodField()
    creada_por = serializers.SerializerMethodField()
    resumen = serializers.SerializerMethodField()
    permisos = serializers.SerializerMethodField()

    class Meta:
        model = Plantilla
        fields = ["id", "nombre", "descripcion", "alcance", "equipo", "creada_por", "creada_en", "resumen", "permisos"]

    def get_equipo(self, p):
        return {"id": p.equipo_id, "nombre": p.equipo.nombre, "color": p.equipo.color} if p.equipo_id else None

    def get_creada_por(self, p):
        return nombre_persona(p.creada_por) if p.creada_por else None

    def get_resumen(self, p):
        return servicio.resumen(p.contenido)

    def get_permisos(self, p):
        return {"gestionar": permisos.puede_gestionar_plantilla(self.context["request"].user, p)}


class PlantillaDetalleSerializer(PlantillaSerializer):
    contenido = serializers.JSONField()

    class Meta(PlantillaSerializer.Meta):
        fields = PlantillaSerializer.Meta.fields + ["contenido"]


class GuardarSerializer(serializers.Serializer):
    tablero = serializers.IntegerField()
    nombre = serializers.CharField(max_length=100)
    descripcion = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    alcance = serializers.ChoiceField(choices=AlcancePlantilla.choices)
    equipo = serializers.IntegerField(required=False, allow_null=True)


class UsarSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=100)
    equipo = serializers.IntegerField(required=False, allow_null=True)
    fecha_inicio = serializers.DateField(required=False)


def _obtener(request, pk, *, gestionar=False) -> Plantilla:
    plantilla = get_object_or_404(Plantilla.objects.select_related("equipo", "creada_por"), pk=pk)
    if not permisos.puede_ver_plantilla(request.user, plantilla):
        raise PermissionDenied("No tienes acceso a esta plantilla.")
    if gestionar and not permisos.puede_gestionar_plantilla(request.user, plantilla):
        raise PermissionDenied("No puedes cambiar esta plantilla.")
    return plantilla


class PlantillasView(APIView):
    def get(self, request):
        qs = Plantilla.objects.visibles_para(request.user).select_related("equipo", "creada_por")
        return Response(PlantillaSerializer(qs, many=True, context={"request": request}).data)

    def post(self, request):
        """Guardar un tablero (que puedo ver) como plantilla."""
        datos = GuardarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        v = datos.validated_data
        tablero = obtener_tablero(request, v["tablero"])
        equipo = get_object_or_404(Equipo, pk=v["equipo"]) if v.get("equipo") else None
        if not permisos.puede_crear_plantilla(request.user, v["alcance"], equipo):
            raise PermissionDenied(
                "Solo un administrador del equipo crea plantillas del equipo, y solo el administrador del módulo, "
                "plantillas para todos."
            )
        plantilla = servicio.guardar_como_plantilla(
            tablero,
            nombre=v["nombre"],
            descripcion=v.get("descripcion", ""),
            alcance=v["alcance"],
            equipo=equipo,
            actor=request.user,
        )
        return Response(
            PlantillaSerializer(plantilla, context={"request": request}).data, status=status.HTTP_201_CREATED
        )


class PlantillaDetalleView(APIView):
    def get(self, request, pk):
        return Response(PlantillaDetalleSerializer(_obtener(request, pk), context={"request": request}).data)

    def patch(self, request, pk):
        plantilla = _obtener(request, pk, gestionar=True)
        servicio.editar_plantilla(
            plantilla, nombre=request.data.get("nombre"), descripcion=request.data.get("descripcion")
        )
        return Response(PlantillaSerializer(plantilla, context={"request": request}).data)

    def delete(self, request, pk):
        servicio.eliminar_plantilla(_obtener(request, pk, gestionar=True))
        return Response(status=status.HTTP_204_NO_CONTENT)


class UsarPlantillaView(APIView):
    """Crear un tablero desde la plantilla: personal (sin `equipo`) o de un
    equipo que administro. Devuelve el id del tablero nuevo."""

    def post(self, request, pk):
        plantilla = _obtener(request, pk)
        datos = UsarSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        v = datos.validated_data
        equipo = None
        if v.get("equipo"):
            equipo = get_object_or_404(Equipo, pk=v["equipo"], archivado=False)
            if not puede_administrar_equipo(request.user, equipo):
                raise PermissionDenied("Solo los administradores del equipo pueden crear tableros.")
        if not v["nombre"].strip():
            raise ValidationError({"nombre": "Ponle un nombre al tablero."})
        tablero = servicio.crear_tablero_desde(
            plantilla,
            nombre=v["nombre"],
            fecha_inicio=v.get("fecha_inicio") or timezone.localdate(),
            equipo=equipo,
            actor=request.user,
        )
        return Response({"tablero": tablero.pk}, status=status.HTTP_201_CREATED)
