# Arquitectura de Planificación (tal como está construida)

> Revisado: 2026-09-26 (rama `dev`, fases 0–4 implementadas, commit `6e9157a`).
> El diseño funcional y el plan por fases están en
> [`plan-modulo-planificacion.md`](plan-modulo-planificacion.md); este documento
> describe el sistema **tal como está en el código**. La evaluación crítica está
> en [`auditoria-arquitectura.md`](auditoria-arquitectura.md).

## 1. Vista de sistema

```
Navegador
  │
  ├─► Portal PALDACA (cpaldaca.com)  ── iframe /planificacion ──►  Planificación
  │        ▲                                                         (planificacion.cpaldaca.com)
  │        │  GET  /api/auth/me/                (cookie-forwarding, SSO)   │
  │        ├──────────────────────────────────────────────────────────────┤
  │        │  POST /api/notificaciones/eventos/[resolver/]  (HMAC propio) │
  │        ├──────────────────────────────────────────────────────────────┤
  │        │  GET  /api/auth/directorio/modulos/planificacion/personas/   │
  │        └──────────────────────────────────────────────────────────────┘
  │
  └─► Planificación suelta: monta `paldaca-nav` (barra de la Suite) del Portal

Planificación
  backend/   Django 6.1 + DRF 3.18 — API REST /api/v1/, reglas de negocio,
             cálculo de Gantt y días hábiles, exportaciones, avisos, crons
  frontend/  SPA React 19 + Vite — en dev en :5181; en producción su build
             (`frontend/dist`) lo sirve Django (WhiteNoise + `spa_shell`)
  BD propia  SQLite hoy; MySQL propia antes de datos reales (D-06)
```

Principios (del plan, verificados en el código):

1. **El Portal es dueño de la identidad; Planificación es dueña de sus datos.**
   Nunca se comparte BD, `SECRET_KEY` ni cookie de sesión con el Portal.
2. **Toda regla de negocio vive en el backend.** El frontend refleja.
3. **Una fuente de datos, varias vistas** (Tablero, Lista, Calendario, Gantt).
4. **Nada se borra en la operación normal**: se archiva.
5. **Concurrencia optimista** con `version` y 409.

## 2. Repositorio

```
Planificacion/
├── backend/                 proyecto Django (ejecutar manage.py desde aquí)
│   ├── Planificacion/       settings.py, urls.py, spa.py (shell SPA), wsgi/asgi
│   ├── core/                identidad local, roles, errores, utilidades, base de tests
│   ├── paldaca_sso/         SSO federado + embed (kit de la Suite, no se toca)
│   ├── integracion_portal/  avisos (outbox), directorio y personas del Portal
│   ├── equipos/             equipos, membresías, invitaciones
│   ├── calendario/          feriados y días hábiles
│   ├── tableros/            tableros, columnas, tarjetas, comentarios, checklist…
│   ├── gantt/               dependencias y reprogramación
│   └── exportacion/         Excel, MS Project (MSPDI), importación (fase 4)
├── frontend/                SPA React (ver docs/modulos/frontend.md)
├── docs/                    documentación (ver docs/README.md)
├── requirements.txt         dependencias Python
└── venv/                    entorno virtual local (no versionado)
```

## 3. Backend por capas

### 3.1 Organización interna de cada app

```
<app>/
  models.py      datos + reglas de UNA instancia (métodos) + lecturas reutilizables
                 en QuerySet propios (Card.objects.activas().con_detalle())
  permisos.py    quién puede qué: funciones puras, sin HTTP
  services/      operaciones con efectos: UNA transacción que deja todo consistente
                 (cambio + historial + avisos). Argumentos por nombre. Lanzan core.errores.*
  api/           serializers.py (formato; no escriben), views.py o views/<recurso>.py
                 (delgadas: permiso → servicio → serializer), urls.py
  tests/         base.py (escenario común) + test_<funcionalidad>.py
  signals.py / receivers.py   solo donde un cambio llega por varios caminos o para
                 invertir una dependencia
  management/commands/        tareas programadas
```

### 3.2 Dependencias entre apps (verificado con los imports, sin tests)

```mermaid
graph BT
  paldaca_sso --> core
  integracion_portal --> core
  integracion_portal --> paldaca_sso
  equipos --> core
  equipos --> integracion_portal
  equipos -. candidatos.py .-> paldaca_sso
  calendario --> core
  tableros --> core
  tableros --> equipos
  tableros --> calendario
  tableros --> integracion_portal
  gantt --> core
  gantt --> calendario
  gantt --> tableros
  exportacion --> core
  exportacion --> calendario
  exportacion --> integracion_portal
  exportacion --> tableros
  exportacion --> gantt
```

Orden de capas (una app solo importa de las de abajo):

```
exportacion
gantt
tableros
equipos · calendario
integracion_portal
paldaca_sso
core
```

El grafo es **acíclico**. Donde una app de abajo necesita reaccionar a otra
de arriba se usa una señal: `tableros.signals.tarjeta_trasladada` → la escucha
`gantt.receivers`. Los imports diferidos (dentro de funciones) que existen
(`tableros.models._equipos_de`, `equipos.models` → `core.roles`) respetan el
mismo sentido.

### 3.3 Convenciones de la API

- Todo bajo `/api/v1/`; `/api/auth/` es del SSO; `/api/health/` responde
  `{"status": "ok"}`.
- Autenticación por sesión local (`SessionAuthentication`), resuelta antes por
  el middleware SSO. `IsAuthenticated` por defecto; las vistas públicas lo
  declaran explícitamente.
- CSRF por cabecera `X-CSRFToken` (la cookie `csrftoken` es legible por JS).
- Errores: 400 `{"detail"}` regla de negocio · 400 formato DRF validación ·
  403 sin permiso · 404 no existe · 409 `{"detail", "actual"}` versión vieja ·
  503 `{"detail"}` Portal no disponible.
- Una `APIView` por recurso (no una por operación, no ViewSets).

## 4. Flujos principales

### 4.1 Petición autenticada

```
SPA ── fetch /api/v1/... (cookie planificacion_sessionid + X-CSRFToken) ──►
  SecurityMiddleware → WhiteNoise → CORS → Session → Common → CSRF → Auth
  → PaldacaEmbedMiddleware (CSP frame-ancestors)
  → PaldacaSsoBootstrapMiddleware (bootstrap/revalidación contra el Portal; 401/403)
  → vista DRF: obtener_tablero/obtener_card (403/404) → serializer (formato)
  → services.* (@transaction.atomic) → serializer de salida
  → core.errores.manejador_excepciones traduce errores de dominio
```

### 4.2 Editar una tarjeta (concurrencia optimista)

1. La SPA aplica el cambio en caché (optimista) y encola el PATCH en serie por
   tarjeta con la `version` vigente.
2. `tarjetas.editar_card` bloquea la fila (`select_for_update`), compara
   `version`; si difiere → `ConflictoDeVersion` → 409 con el estado actual.
3. Aplica campos, `clean()`, responsables, sube `version`, historial,
   reubica si cambió de columna, avisa asignaciones y sincroniza el
   vencimiento. Todo en una transacción.
4. La SPA reemplaza su copia por la respuesta (o por `actual` si fue 409).

### 4.3 Aviso a la campana del Portal (outbox)

```
servicio de negocio (tableros/equipos/exportacion)
  └─ integracion_portal.notificaciones.emitir(...)      ← misma transacción
        └─ INSERT AvisoSaliente(pendiente) + on_commit(_despachar)
commit
  └─ hilo de fondo: enviar(id) → UPDATE condicional (reserva) → POST firmado
        ├─ 2xx → enviado
        ├─ red/5xx/credenciales → pendiente, reintento 1,2,4… min (máx. 10, techo 6 h)
        └─ 400/404 → descartado
cron cada 5 min: manage.py procesar_avisos → reintenta pendientes en orden
```

### 4.4 Vencimientos

- `vencimiento()` se calcula al serializar (nunca se guarda): terminada |
  sin_fecha | vencida | vence_pronto (≤ umbral días hábiles; umbral leído del
  tipo de aviso en el Portal, 2 por defecto) | al_dia.
- Cron diario `manage.py revisar_vencimientos`: emite **una vez por
  transición** (`Card.aviso_vencimiento`) y resuelve lo que dejó de aplicar.
- Terminar, archivar o mover la fecha resuelve el aviso al instante
  (`vencimientos.sincronizar` desde los servicios de tarjetas).

### 4.5 Embed y navegación

- `PaldacaEmbedMiddleware` pone `Content-Security-Policy: frame-ancestors`
  (no `X-Frame-Options`, que no admite lista de orígenes).
- `spa_shell` sirve `frontend/dist/index.html` para toda ruta que no sea
  `admin/`, `api/`, `static/` ni `assets/` (los bundles los sirve WhiteNoise
  desde `WHITENOISE_ROOT`).
- La SPA emite `ready` / `navigate` / `session-expired` / `forbidden` por
  `postMessage` (`paldaca-embed` v1) para que la URL del Portal refleje
  tablero, vista y tarjeta.
- Suelta, monta `paldaca-nav` del Portal (menú, campana, perfil).

## 5. Frontend

Resumen (detalle en [`modulos/frontend.md`](modulos/frontend.md)):

```
main.tsx   QueryClient + Router + MotionConfig + Toaster
App.tsx    useIdentity → pantallas de estado | Shell + rutas lazy
pages/     una por ruta
components/<dominio>/ y components/ui/
api/       client (fetch + CSRF), queries (TanStack Query), tipos
lib/       lógica pura (fechas, geometría Gantt, filtros, estilos)
embed/     protocolo con el Portal
```

## 6. Configuración y entornos

Todo por variables de entorno (`backend/.env`, plantilla en
`backend/.env.example`; `load_dotenv` en `settings.py`):

| Grupo | Variables |
|---|---|
| Núcleo | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` |
| Sesión | `SESSION_COOKIE_NAME` (`planificacion_sessionid`), `SESSION_COOKIE_DOMAIN` (vacío), `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_AGE` (8 h) |
| SSO | `PALDACA_SSO_ENABLED` (false = deploy dark), `PALDACA_MODULO_CODIGO`, `PALDACA_PORTAL_URL`, `PALDACA_PORTAL_API_URL`, `PALDACA_SSO_*` (timeouts, gracia, breaker) |
| Avisos | `PALDACA_NOTIFICACIONES_ACTIVAS`, `PALDACA_NOTIF_SECRET` (≥ 32, = `PALDACA_NOTIF_SECRET_PLANIFICACION` del Portal), `PALDACA_NOTIF_ASINCRONO` |
| Embed | `PALDACA_SHELL_PATH` (`/planificacion`), `PALDACA_FRAME_ANCESTORS` |

Puertos locales: Portal frontend 5173 · Portal backend 8000 · Planificación
backend **8007** · Planificación frontend **5181**. Idioma `es-ve`, zona
`America/Caracas`.

## 7. Despliegue y tareas programadas

- Servidor WSGI: gunicorn (en `requirements.txt`); estáticos con WhiteNoise.
- Coolify (Scheduled Tasks):
  - `python manage.py procesar_avisos` — cada 5 minutos.
  - `python manage.py revisar_vencimientos` — una vez al día, temprano.
- En local los corre el arranque de la Suite (`iniciar.ps1 -Modo planificacion`
  en el repo del Portal).
- Antes de producción: MySQL propia (D-06), `PALDACA_SSO_ENABLED=true`,
  `PALDACA_FRAME_ANCESTORS`, secreto de avisos, cookies `Secure` y el resto de
  la lista de la auditoría (§Checklist de despliegue).

## 8. Decisiones vigentes

Tabla completa en el plan §9. Las que más condicionan el código:
D-01 fechas solo día · D-05 Gantt propio (HTML + SVG) · D-06 MySQL propia
pendiente · D-07 el admin del módulo no ve tableros personales ajenos ·
D-09 varios tableros personales · D-10 `paldaca-nav` como menú suelto.
