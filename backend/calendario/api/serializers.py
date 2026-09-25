from rest_framework import serializers

from calendario.models import ANIO_RECURRENTE, Feriado


class FeriadoEscrituraSerializer(serializers.Serializer):
    fecha = serializers.DateField()
    nombre = serializers.CharField(max_length=100)
    recurrente = serializers.BooleanField(default=False)

    def validate_nombre(self, valor):
        if not valor.strip():
            raise serializers.ValidationError("Ponle un nombre al feriado.")
        return valor.strip()

    def validate(self, datos):
        if datos["recurrente"]:
            datos["fecha"] = datos["fecha"].replace(year=ANIO_RECURRENTE)
        if Feriado.objects.filter(fecha=datos["fecha"], recurrente=datos["recurrente"]).exists():
            raise serializers.ValidationError({"fecha": "Ya hay un feriado ese día."})
        return datos
