#!/bin/sh
# Arranque del contenedor: migra (esperando a que MySQL acepte conexiones),
# crea la tabla de caché compartida y levanta gunicorn.
set -e

if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL es obligatoria en el contenedor (mysql://usuario:clave@host:3306/planificacion)." >&2
    exit 1
fi

intentos=0
until python manage.py migrate --noinput; do
    intentos=$((intentos + 1))
    if [ "$intentos" -ge 15 ]; then
        echo "La base de datos no respondió tras $intentos intentos." >&2
        exit 1
    fi
    echo "Esperando a la base de datos ($intentos/15)..."
    sleep 4
done

python manage.py createcachetable

exec gunicorn Planificacion.wsgi:application \
    --bind "0.0.0.0:${PORT:-8007}" \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout "${GUNICORN_TIMEOUT:-60}" \
    --access-logfile - \
    --error-logfile -
