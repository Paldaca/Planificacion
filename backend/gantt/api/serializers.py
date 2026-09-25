from __future__ import annotations

from rest_framework import serializers

from gantt.models import Dependencia, TipoDependencia
from gantt.services.dependencias import MAX_DESFASE, incumple


class DependenciaSerializer(serializers.ModelSerializer):
    incumplida = serializers.SerializerMethodField()

    class Meta:
        model = Dependencia
        fields = ["id", "predecesora", "sucesora", "tipo", "desfase_dias", "incumplida"]

    def get_incumplida(self, dep):
        return incumple(dep)


class DependenciaEscrituraSerializer(serializers.Serializer):
    predecesora = serializers.IntegerField()
    sucesora = serializers.IntegerField()
    tipo = serializers.ChoiceField(choices=TipoDependencia.choices, default=TipoDependencia.FIN_INICIO)
    desfase_dias = serializers.IntegerField(default=0, min_value=-MAX_DESFASE, max_value=MAX_DESFASE)


class DependenciaCambioSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=TipoDependencia.choices, required=False)
    desfase_dias = serializers.IntegerField(required=False, min_value=-MAX_DESFASE, max_value=MAX_DESFASE)


class ProgramarSerializer(serializers.Serializer):
    fecha_inicio = serializers.DateField(allow_null=True)
    fecha_fin = serializers.DateField(allow_null=True)
    version = serializers.IntegerField(min_value=1)
    mover_sucesoras = serializers.BooleanField(default=True)

    def validate(self, datos):
        if datos["fecha_inicio"] and datos["fecha_fin"] and datos["fecha_fin"] < datos["fecha_inicio"]:
            raise serializers.ValidationError({"fecha_fin": "La fecha final no puede ser anterior a la de inicio."})
        return datos
