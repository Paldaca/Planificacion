from __future__ import annotations

import re

from rest_framework import serializers

from integracion_portal.personas import persona
from tableros import permisos

from .models import Equipo, EstadoInvitacion, InvitacionEquipo, MiembroEquipo, RolEquipo

COLOR_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class EquipoSerializer(serializers.ModelSerializer):
    mi_rol = serializers.SerializerMethodField()
    miembros = serializers.SerializerMethodField()
    num_miembros = serializers.SerializerMethodField()
    num_tableros = serializers.SerializerMethodField()
    invitaciones_pendientes = serializers.SerializerMethodField()
    permisos = serializers.SerializerMethodField()

    class Meta:
        model = Equipo
        fields = [
            "id",
            "nombre",
            "descripcion",
            "color",
            "archivado",
            "mi_rol",
            "miembros",
            "num_miembros",
            "num_tableros",
            "invitaciones_pendientes",
            "permisos",
            "creado_en",
        ]

    def _usuario(self):
        return self.context["request"].user

    def get_mi_rol(self, equipo):
        m = permisos.membresia(self._usuario(), equipo)
        return m.rol if m else None

    def get_miembros(self, equipo):
        """Vista previa para las tarjetas (primeros 6)."""
        qs = equipo.miembros.select_related("usuario__disciplina").order_by("agregado_en")[:6]
        return [persona(m.usuario) for m in qs]

    def get_num_miembros(self, equipo):
        return equipo.miembros.count()

    def get_num_tableros(self, equipo):
        return equipo.tableros.filter(archivado=False).count()

    def get_invitaciones_pendientes(self, equipo):
        if not permisos.puede_administrar_equipo(self._usuario(), equipo):
            return None
        return equipo.invitaciones.filter(estado=EstadoInvitacion.PENDIENTE).count()

    def get_permisos(self, equipo):
        return {"administrar": permisos.puede_administrar_equipo(self._usuario(), equipo)}


class EquipoEscrituraSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=100, required=False)
    descripcion = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    color = serializers.CharField(max_length=7, required=False)

    def validate_nombre(self, valor):
        if not valor.strip():
            raise serializers.ValidationError("El nombre no puede quedar vacío.")
        return valor.strip()

    def validate_color(self, valor):
        if not COLOR_HEX.match(valor):
            raise serializers.ValidationError("Color inválido (usa #RRGGBB).")
        return valor.lower()


class MiembroSerializer(serializers.ModelSerializer):
    persona = serializers.SerializerMethodField()
    agregado_por = serializers.SerializerMethodField()
    es_yo = serializers.SerializerMethodField()

    class Meta:
        model = MiembroEquipo
        fields = ["id", "persona", "rol", "agregado_por", "agregado_en", "es_yo"]

    def get_persona(self, m):
        return persona(m.usuario)

    def get_agregado_por(self, m):
        return persona(m.agregado_por)

    def get_es_yo(self, m):
        return m.usuario_id == self.context["request"].user.pk


class InvitacionSerializer(serializers.ModelSerializer):
    equipo = serializers.SerializerMethodField()
    invitado = serializers.SerializerMethodField()
    invitado_por = serializers.SerializerMethodField()

    class Meta:
        model = InvitacionEquipo
        fields = [
            "id",
            "equipo",
            "invitado",
            "invitado_por",
            "rol",
            "mensaje",
            "estado",
            "creada_en",
            "respondida_en",
        ]

    def get_equipo(self, inv):
        e = inv.equipo
        return {
            "id": e.pk,
            "nombre": e.nombre,
            "color": e.color,
            "descripcion": e.descripcion,
            "num_miembros": e.miembros.count(),
        }

    def get_invitado(self, inv):
        return persona(inv.invitado)

    def get_invitado_por(self, inv):
        return persona(inv.invitado_por)


class InvitarSerializer(serializers.Serializer):
    usuario = serializers.IntegerField()
    rol = serializers.ChoiceField(choices=RolEquipo.choices, default=RolEquipo.MIEMBRO)
    mensaje = serializers.CharField(max_length=300, required=False, allow_blank=True)


class CambiarRolSerializer(serializers.Serializer):
    rol = serializers.ChoiceField(choices=RolEquipo.choices)
