# Planificación PALDACA — imagen de producción (Coolify). Guía: docs/despliegue.md

# --- 1. Frontend: compila la SPA (Vite, .env.production) ----------------------
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Backend: Django + gunicorn, sirve también la SPA compilada -----------
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8007 \
    RUNNING_IN_DOCKER=1

WORKDIR /app

# mysqlclient se compila contra las librerías de MySQL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        default-libmysqlclient-dev \
        build-essential \
        pkg-config \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY --from=frontend /app/frontend/dist frontend/dist
COPY entrypoint.sh /app/entrypoint.sh

# Estáticos del admin/DRF en la imagen (inmutables). DEBUG solo para este paso:
# sin él, settings exige clave y DATABASE_URL, que no existen al construir.
RUN cd backend \
    && RUNNING_IN_DOCKER=0 DJANGO_DEBUG=true python manage.py collectstatic --noinput \
    && sed -i 's/\r$//' /app/entrypoint.sh \
    && chmod +x /app/entrypoint.sh \
    && useradd --create-home --uid 1000 app \
    && chown -R app:app /app

USER app
WORKDIR /app/backend

EXPOSE 8070

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8070}/api/health/" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
