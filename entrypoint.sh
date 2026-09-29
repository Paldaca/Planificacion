#!/bin/sh
# Arranque del contenedor: espera a que MySQL acepte conexiones, migra, crea la
# tabla de caché compartida y levanta gunicorn.
#
# Esperar y migrar van por separado a propósito: antes se reintentaba
# `migrate` entero y un error de migración se veía como «esperando a la base»
# 15 veces, sin mostrar la causa. MySQL no deshace un CREATE TABLE: si un
# despliegue se corta a mitad de una migración, el siguiente choca con
# «Table ... already exists» (ver docs/despliegue.md, §7).
set -e

if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL es obligatoria en el contenedor (mysql://usuario:clave@host:3306/planificacion)." >&2
    exit 1
fi

# Sale con 0 si conecta, 3 si la base aún no acepta conexiones (se reintenta) y
# 2 con cualquier otro error (versión de MySQL no soportada, credenciales en
# una base que sí responde, configuración): esperar no lo arregla.
conectar() {
    python -c "
import os, sys
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Planificacion.settings')
django.setup()
from django.db import connection
from django.db.utils import OperationalError
try:
    connection.ensure_connection()
except OperationalError as exc:
    print(exc, file=sys.stderr)
    sys.exit(3)
"
}

intentos=0
while :; do
    codigo=0
    conectar 2>/tmp/conexion.err || codigo=$?
    [ "$codigo" -eq 0 ] && break
    if [ "$codigo" -ne 3 ]; then
        echo "ERROR al conectar con la base de datos (no se reintenta):" >&2
        tail -n 5 /tmp/conexion.err >&2
        exit 1
    fi
    intentos=$((intentos + 1))
    if [ "$intentos" -ge 30 ]; then
        echo "La base de datos no aceptó conexiones tras $intentos intentos. Último error:" >&2
        tail -n 5 /tmp/conexion.err >&2
        exit 1
    fi
    echo "Esperando a la base de datos ($intentos/30)..."
    sleep 3
done

echo "Aplicando migraciones..."
if ! python manage.py migrate --noinput; then
    echo "" >&2
    echo "ERROR: las migraciones fallaron (el detalle está arriba)." >&2
    echo "Si dice «Table ... already exists», un despliegue anterior se cortó a mitad" >&2
    echo "de una migración: ver docs/despliegue.md, §7 «Problemas frecuentes»." >&2
    exit 1
fi

python manage.py createcachetable

echo "Iniciando gunicorn en el puerto ${PORT:-8070}..."
exec gunicorn Planificacion.wsgi:application \
    --bind "0.0.0.0:${PORT:-8070}" \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout "${GUNICORN_TIMEOUT:-60}" \
    --access-logfile - \
    --error-logfile -
