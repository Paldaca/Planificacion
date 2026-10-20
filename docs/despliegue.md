# Despliegue en Coolify

> Cómo poner Planificación en producción (`planificacion.cpaldaca.com`,
> embebida en `cpaldaca.com/planificacion`). Revisado: 2026-09-28, con la
> imagen probada contra MySQL 8.4 (suite completa, `check --deploy`, health,
> SPA, cabeceras y comandos programados).
>
> **Diferencia con los satélites viejos** (Activos, HDT, Códigos, Calidad; ver
> `Portal-Paldaca/docs/COOLIFY.md`): Planificación es **federada**. Tiene su
> **propia MySQL**, su propia `DJANGO_SECRET_KEY` y su propia cookie
> (`planificacion_sessionid`). **No** se le pone la `DATABASE_URL` ni la clave
> del Portal. La identidad llega del Portal por API (SSO federado).

## 1. Qué hay en el repo

| Archivo | Qué hace |
|---|---|
| `Dockerfile` | Etapa 1 (Node 22): `npm ci` + `npm run build` con `frontend/.env.production`. Etapa 2 (Python 3.12): dependencias, `backend/`, la SPA compilada y `collectstatic`. Corre como usuario `app`. `HEALTHCHECK` a `/api/health/`. |
| `entrypoint.sh` | Exige `DATABASE_URL`; espera a que MySQL acepte conexiones (hasta 30 intentos); `migrate` **una vez** (si falla, muestra el error y sale); `createcachetable`; gunicorn en `0.0.0.0:$PORT` (8070). |
| `docker-compose.yml` | Mismo contenedor con las variables de producción y sus valores por defecto (para Coolify en modo Compose o para probar en local). |
| `.dockerignore` | Deja fuera `venv`, `node_modules`, `dist`, `.env`, bases SQLite y `docs`. |

Django sirve todo: la API, el admin y la SPA (WhiteNoise sirve `frontend/dist`
como raíz y `spa_shell` el `index.html`). No hay nginx.

## 2. Recursos en Coolify

1. **Base de datos**: *New Resource → Database → MySQL* **8.4 o superior**
   (Django 6.1 no arranca con 8.0: «MySQL 8.4 or later is required»), **propia** (nunca
   la del Portal). Base `planificacion`, juego de caracteres `utf8mb4`.
   Anota la URL interna: `mysql://USUARIO:CLAVE@HOST:3306/planificacion`
   (URL-encoda `@ # / :` si la clave los trae).
2. **Aplicación**: *New Resource → Application → Dockerfile* sobre este repo,
   rama `main`.
   - Ports Exposes: `8070` (el puerto del contenedor; `PORT` vale 8070 en la imagen).
   - Domains: `https://planificacion.cpaldaca.com`.
   - Healthcheck: `GET /api/health/` en el puerto `8070` (responde sin sesión
     y sin redirección a HTTPS), con **Start Period de 180 s** o más: el
     primer despliegue crea todas las tablas y, si Coolify lo corta a mitad,
     la base queda a medias (ver §7).

## 3. Variables de entorno (runtime)

Obligatorias:

```env
DATABASE_URL=mysql://USUARIO:CLAVE@HOST:3306/planificacion
DJANGO_SECRET_KEY=<propia, >= 40 caracteres, distinta de la del Portal>
DJANGO_ALLOWED_HOSTS=planificacion.cpaldaca.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://planificacion.cpaldaca.com
PALDACA_SSO_ENABLED=true
PALDACA_NOTIF_SECRET=<>= 32 caracteres; el MISMO valor que PALDACA_NOTIF_SECRET_PLANIFICACION del Portal>
```

Con valor por defecto correcto para `cpaldaca.com` (solo si cambia algo):

| Variable | Defecto en producción |
|---|---|
| `DJANGO_DEBUG` | `false` (nunca `true` en producción) |
| `PALDACA_MODULO_CODIGO` | `planificacion` |
| `PALDACA_PORTAL_URL` / `PALDACA_PORTAL_API_URL` | `https://cpaldaca.com` (el Portal sirve `/api/` en su mismo origen) |
| `PALDACA_SSO_LOGIN_URL` | `https://cpaldaca.com/login` |
| `PALDACA_SHELL_PATH` | `/planificacion` |
| `PALDACA_FRAME_ANCESTORS` | `'self'`, `PALDACA_PORTAL_URL`, `https://cpaldaca.com` y `https://www.cpaldaca.com` |
| `SESSION_COOKIE_NAME` | `planificacion_sessionid` (**nunca** `paldaca_sessionid`) |
| `SESSION_COOKIE_SECURE`, `DJANGO_SECURE_SSL_REDIRECT` | `true` |
| `DJANGO_SECURE_HSTS_SECONDS` | `31536000` |
| `CORS_ALLOWED_ORIGINS` | vacío: la SPA es del mismo origen |
| `LOG_LEVEL` | `INFO` (registros `planificacion.*` y `paldaca.*`; el resto desde WARNING) |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_HOST_USER` / `DEFAULT_FROM_EMAIL` | `sunfire.mxrouting.net` / `465` / `notificaciones@cpaldaca.com` |
| `EMAIL_HOST_PASSWORD` | vacía: sin ella la invitación se crea y avisa en la campana, pero el correo no sale (`INVITACION_CORREO_FALLO` en el log) |
| `PORT`, `GUNICORN_WORKERS`, `GUNICORN_TIMEOUT` | `8070`, `3`, `60` |

Sin `DATABASE_URL` el contenedor no arranca (a propósito: un SQLite dentro de
la imagen se perdería en cada despliegue). Sin DEBUG, una `DJANGO_SECRET_KEY`
corta o `django-insecure-…` también impide arrancar.

El build del frontend no lleva variables de Coolify: usa
`frontend/.env.production` (Portal en `https://cpaldaca.com`, menú de la Suite
desde `https://cpaldaca.com/static`, API del Portal en
`https://cpaldaca.com/api`). El origen al que se envían los mensajes del embed
sale del servidor en tiempo de ejecución (`PALDACA_PORTAL_URL`), no del build.

## 4. Tareas programadas (Coolify → Scheduled Tasks)

Contenedor de la aplicación, directorio `/app/backend` (el `WORKDIR` de la
imagen):

| Comando | Frecuencia | Para qué |
|---|---|---|
| `python manage.py procesar_avisos` | `*/5 * * * *` | Reintenta avisos pendientes a la campana del Portal y purga los cerrados viejos. |
| `python manage.py instalar_plantillas` | **No es una tarea programada**: se ejecuta una vez tras el primer despliegue (y con `--actualizar` cuando cambie el plan tipo) | Crea las plantillas del programa («Proyecto de software», «Soporte»). Son la metodología de AIT: instalarlas **para el equipo AIT** y no globales. Primero `--listar-equipos` (id, nombre y miembros) y después `--equipo <id>`. |
| `python manage.py revisar_vencimientos` | `0 6 * * *` (06:00 Caracas; Coolify usa la hora del servidor) | Avisos de «vence pronto» y «vencida». |

## 5. Cambios en el Portal

Planificación solo aparece dentro del Portal cuando éste lo habilita. En el
recurso del Portal (rama con el módulo, hoy `feat/modulo-planificacion`):

- **Runtime**:
  - `PALDACA_NOTIF_SECRET_PLANIFICACION=<el mismo secreto que arriba>` y,
    cuando se vea llegar avisos, `planificacion` en `PALDACA_NOTIF_ESTRICTO`.
  - `https://planificacion.cpaldaca.com` en `CSRF_TRUSTED_ORIGINS` y en
    `CORS_ALLOWED_ORIGINS` (la barra `paldaca-nav` del módulo abierto suelto
    llama a la API del Portal con credenciales).
  - `PALDACA_DIRECTORIO_LECTURA_MODULOS` incluye `planificacion` (es el
    valor por defecto): lo usa el buscador de personas al invitar.
- **Build** (rebuild del Portal): `VITE_SATELLITE_PLANIFICACION_URL=https://planificacion.cpaldaca.com`
  y `planificacion` en `VITE_EMBEDDED_MODULES`.
- `migrate` del Portal crea el módulo `planificacion` y sus tipos de aviso
  (migraciones `core 0019` y `notificaciones 0016+`). El acceso de cada
  persona se da en el Portal (Administración → accesos al módulo).

## 6. Orden y comprobación

1. MySQL de Planificación en verde.
2. Desplegar Planificación. En los logs: «Aplicando migraciones…», tabla de
   caché e «Iniciando gunicorn en el puerto 8070».
3. `https://planificacion.cpaldaca.com/api/health/` → 200 `{"status":"ok"}`.
4. Actualizar el Portal (§5) y desplegarlo.
5. En el navegador, con una cuenta que tenga el módulo:
   - `https://cpaldaca.com/planificacion` carga sin la banda «¿No ves el
     contenido?» y la URL del Portal sigue a la navegación del módulo.
   - Crear un tablero, una tarjeta con fechas y verla en el Gantt.
   - Asignar a otra persona → le llega el aviso a la campana del Portal.
   - `https://planificacion.cpaldaca.com` suelto muestra la barra de la Suite.
6. Respuesta del módulo: cabecera `Content-Security-Policy: frame-ancestors
   'self' https://cpaldaca.com …` y **sin** `X-Frame-Options`.

## 7. Problemas frecuentes

| Síntoma | Causa |
|---|---|
| El contenedor sale con «DATABASE_URL es obligatoria» | Falta vincular la MySQL o la variable. |
| `ImproperlyConfigured` por la clave | `DJANGO_SECRET_KEY` ausente, corta o `django-insecure-…`. |
| Health en rojo con 400 | El healthcheck usa un host que no está en `DJANGO_ALLOWED_HOSTS`. El de la imagen llama a `127.0.0.1`, que en el contenedor (`RUNNING_IN_DOCKER=1`) se acepta siempre; si Coolify usa otro host, agrégalo. |
| Pide login dentro del iframe o 401 constante | `PALDACA_SSO_ENABLED` falso, `PALDACA_PORTAL_API_URL` equivocada o la persona no tiene el módulo en el Portal. |
| Banda «¿No ves el contenido?» | `PALDACA_PORTAL_URL` no es el origen real del Portal (los `postMessage` se descartan). |
| `Refused to frame` | `PALDACA_FRAME_ANCESTORS` sin el origen del Portal. |
| Los avisos no llegan | `PALDACA_NOTIF_SECRET` distinto del `PALDACA_NOTIF_SECRET_PLANIFICACION` del Portal (en los logs: `NOTIFICACION_…` con 401/403), o la tarea `procesar_avisos` no está programada. |
| La invitación no llega por correo | Falta `EMAIL_HOST_PASSWORD` del buzón `notificaciones@cpaldaca.com`, o el invitado no tiene email en su cuenta. La invitación y la campana sí quedan. |
| SPA en blanco sin errores en el servidor | El catch-all de `urls.py` captura `assets/` (no debe). |
| «MySQL 8.4 or later is required» | La MySQL es 8.0: Django 6.1 exige 8.4 o superior. |
| «Las migraciones fallaron» con `Table 'planificacion_…' already exists` (1050) | Un despliegue anterior se cortó a mitad de una migración: MySQL no deshace un `CREATE TABLE`, así que la tabla existe pero la migración no quedó registrada. En el **primer despliegue** (sin datos): en la MySQL **de Planificación** (comprobar antes con `SHOW TABLES` que no hay tablas del Portal como `core_usuario`), con root, `DROP DATABASE planificacion; CREATE DATABASE planificacion CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;` y volver a desplegar con el Start Period del healthcheck en 180 s. **Con datos, nunca**: revisar qué migración quedó a medias y completarla a mano. |
| Healthcheck `Failed to connect to 127.0.0.1 port 8070` | gunicorn no llegó a arrancar (mira el error anterior en los logs) o `PORT` en Coolify no es `8070`. |

## 8. Probar la imagen en local

```powershell
docker network create plan-prueba
docker run -d --name plan-mysql --network plan-prueba -e MYSQL_ROOT_PASSWORD=<clave> -e MYSQL_DATABASE=planificacion mysql:8.4
docker build -t planificacion:local .
docker run -d --name plan-web --network plan-prueba -p 8027:8070 `
  -e DATABASE_URL=mysql://root:<clave>@plan-mysql:3306/planificacion `
  -e DJANGO_SECRET_KEY=<clave-de-prueba-de-40-o-mas> `
  -e DJANGO_ALLOWED_HOSTS=localhost -e DJANGO_SECURE_SSL_REDIRECT=false `
  -e SESSION_COOKIE_SECURE=false planificacion:local
curl http://localhost:8027/api/health/
# Suite de pruebas contra MySQL (el usuario root puede crear la base de pruebas):
docker exec -e DJANGO_DEBUG=true plan-web python manage.py test
```

Al terminar: `docker rm -f plan-web plan-mysql` y `docker network rm plan-prueba`.
