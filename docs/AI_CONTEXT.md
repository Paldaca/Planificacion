# AI_CONTEXT — Planificación PALDACA

> Punto de entrada para asistentes de IA (Claude Code, Cursor) y para
> cualquier persona que llegue nueva al repo. Resume qué es el programa, cómo
> está hecho y dónde está cada cosa. Revisado: 2026-09-26.
>
> **Regla del proyecto:** antes de modificar un módulo, leer su documento en
> [`docs/modulos/`](modulos/) (tabla en §6). Si el cambio altera lo que ahí
> se describe, actualizar el documento en el mismo cambio.

## 1. Qué es

**Planificación** es el gestor de trabajo por **tableros** y **tarjetas** de
PALDACA Suite. Cada tarjeta es una actividad con fechas (solo día), urgencia,
responsables, comentarios con @menciones, checklist e historial. Un tablero es
**personal** (privado; cada persona puede tener varios) o de **equipo**
(equipos creados en el módulo; se entra solo por invitación aceptada). El
mismo tablero se ve como **Tablero (Kanban), Lista, Calendario y Gantt**
(con dependencias y días hábiles), y se exporta e importa en **Excel** y
**MS Project** (fase 4).

Es un satélite **federado** del Portal PALDACA:

- Vive embebido en `cpaldaca.com/planificacion` (iframe) o suelto en su
  subdominio con la barra de la Suite (`paldaca-nav`).
- **El Portal es dueño de la identidad** (login único, acceso al módulo,
  campana de avisos). **Planificación es dueña de sus datos** (BD propia,
  `SECRET_KEY` propia; nunca comparte tablas ni cookie con el Portal).
- Código de módulo: `planificacion`.

Usuarios: personal de PALDACA (Venezuela). Idioma `es-ve`, zona
`America/Caracas`. Todo el código, los comentarios, los mensajes y la UI
están **en español**.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12 · Django 6.1 · DRF 3.18 · django-cors-headers · WhiteNoise · gunicorn · openpyxl · requests · python-dotenv |
| Frontend | React 19 · TypeScript 6 · Vite 8 · Tailwind CSS 4 · TanStack Query 5 · React Router 7 · dnd-kit · Radix UI · Motion · sonner · lucide-react · oxlint |
| BD | SQLite en desarrollo; MySQL propia pendiente antes de producción (D-06) |
| Despliegue | Coolify (contenedor + Scheduled Tasks) |

## 3. Mapa del repositorio

```
backend/                     proyecto Django — manage.py se ejecuta DESDE AQUÍ
  Planificacion/             settings.py, urls.py, spa.py (sirve el build de la SPA)
  core/                      identidad local espejo, roles, errores de dominio, base de tests
  paldaca_sso/               SSO federado + embed (kit de la Suite: NO se modifica)
  integracion_portal/        ÚNICO punto que habla con el Portal: avisos, directorio, personas
  equipos/                   equipos, miembros, invitaciones
  calendario/                feriados y días hábiles (fuente única)
  tableros/                  tableros, columnas, tarjetas, comentarios, checklist, vencimientos
  gantt/                     dependencias entre tarjetas y reprogramación
  exportacion/               Excel, MS Project (MSPDI), importación — fase 4
  plantillas/                plantillas de tablero (foto JSON con fechas en días hábiles) — fase 5
frontend/src/
  api/                       client.ts (fetch + CSRF), queries.ts (TanStack Query), tipos.ts
  auth/ embed/               identidad vía /api/auth/me/ y protocolo paldaca-embed
  pages/ components/         una página por ruta; componentes por dominio y ui/
  hooks/ lib/                hooks; lógica pura sin React (fechas, gantt, filtros…)
docs/                        documentación (índice en docs/README.md)
```

Orden de dependencias entre apps (una app solo importa de las de abajo):
`exportacion · plantillas → gantt → tableros → equipos · calendario →
integracion_portal → paldaca_sso → core`. Para reaccionar «hacia arriba» se usan señales
(`tableros.signals.tarjeta_trasladada`, la escucha `gantt`).

## 4. Glosario mínimo

| Término | Significado |
|---|---|
| Tarjeta / card | Actividad. En código y API `Card`/`cards`; en la UI «tarjeta». Número correlativo por tablero (`#12`). |
| Columna final | Columna cuyas tarjetas cuentan como terminadas (`es_final`, por defecto «Hecho»). Entrar fija `completada_en`; salir lo limpia. |
| Vencimiento | Derivado, nunca se guarda: terminada · sin_fecha · vencida · vence_pronto (≤ umbral días hábiles, 2 por defecto, lo fija el Portal) · al_dia. |
| En Gantt | Tiene inicio y fin y (`en_gantt=si`) o (`heredar` y su columna `incluir_en_gantt`). |
| Días hábiles | Lunes a viernes que no son feriado (`calendario`); los móviles se calculan desde la Pascua. |
| Cuenta espejo | Usuario local creado desde el Portal (`CuentaPortal.portal_user_id` es la clave de unión). |
| Admin del módulo | Rol del Portal: administra todos los equipos y el calendario; no ve tableros personales ajenos. |
| Aviso | Notificación en la campana del Portal, emitida con firma HMAC y bandeja de salida. |

## 5. Reglas de oro

1. **Toda regla de negocio vive en el backend.** El frontend solo refleja
   (permisos incluidos: vienen en `permisos` del tablero).
2. **Capas del backend:** vistas delgadas (permiso → servicio → serializer);
   efectos en `services/` dentro de una transacción; lecturas en QuerySet;
   reglas de una instancia en el modelo; permisos en `permisos.py`. Los
   serializers no escriben. Los servicios lanzan `core.errores.*`, nunca
   respuestas HTTP.
3. **Concurrencia optimista:** tarjetas y columnas llevan `version`; versión
   vieja → 409 con el estado actual.
4. **Nada se borra físicamente** en la operación normal: se archiva.
5. **Tablas de negocio con prefijo `planificacion_`** (`Meta.db_table`); FK a
   personas contra `settings.AUTH_USER_MODEL`.
6. **Días hábiles solo desde `calendario`.**
7. **Solo `integracion_portal` habla con el Portal**; los tipos de aviso se
   crean con migraciones **en el Portal**. Nunca avisar al actor; siempre con
   deep link a la tarjeta.
8. **No tocar `paldaca_sso/`** (kit compartido) ni reponer
   `XFrameOptionsMiddleware`; `SESSION_COOKIE_NAME` nunca `paldaca_sessionid`.
9. **No romper el embed ni R-07:** nada de temporizadores que llamen a la API
   sin actividad del usuario y con la pestaña oculta.
10. **Fechas solo día** (`"YYYY-MM-DD"`); en el frontend parsear con
    `parsearDia`, nunca `new Date("YYYY-MM-DD")`.

## 6. Documentación por módulo (leer antes de modificar)

| Si vas a tocar… | Lee primero |
|---|---|
| `backend/core/` | [`modulos/core.md`](modulos/core.md) |
| `backend/paldaca_sso/` | [`modulos/paldaca_sso.md`](modulos/paldaca_sso.md) |
| `backend/integracion_portal/` | [`modulos/integracion_portal.md`](modulos/integracion_portal.md) |
| `backend/equipos/` | [`modulos/equipos.md`](modulos/equipos.md) |
| `backend/calendario/` | [`modulos/calendario.md`](modulos/calendario.md) |
| `backend/tableros/` | [`modulos/tableros.md`](modulos/tableros.md) |
| `backend/gantt/`, `frontend/src/components/gantt/`, `frontend/src/lib/gantt.ts` | [`modulos/gantt.md`](modulos/gantt.md) |
| `backend/exportacion/`, importar/exportar en el frontend | [`modulos/exportacion.md`](modulos/exportacion.md) |
| `backend/plantillas/`, `frontend/src/components/plantillas/` | [`modulos/plantillas.md`](modulos/plantillas.md) |
| `frontend/` | [`modulos/frontend.md`](modulos/frontend.md) |
| `backend/Planificacion/` (settings, urls, spa) | [`arquitectura.md`](arquitectura.md) §3.3, §4.5, §6 y [`auditoria-arquitectura.md`](auditoria-arquitectura.md) |
| Un cambio que cruza varios módulos | [`arquitectura.md`](arquitectura.md) + el documento de cada módulo |
| Alcance, fases, decisiones | [`plan-modulo-planificacion.md`](plan-modulo-planificacion.md) |
| Integración con la Suite | [`guia-integracion-programas-satelite.md`](guia-integracion-programas-satelite.md) |

## 7. Comandos

Rutas relativas a la raíz del repo; en Windows (PowerShell) el venv está en
`venv\Scripts\`.

```powershell
# Backend (desde backend/)
..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8007
..\venv\Scripts\python.exe manage.py test                    # 131 pruebas, ~25 s
..\venv\Scripts\python.exe manage.py test tableros.tests.test_tarjetas
..\venv\Scripts\python.exe manage.py makemigrations <app>
..\venv\Scripts\python.exe manage.py migrate
..\venv\Scripts\python.exe manage.py procesar_avisos          # cron cada 5 min
..\venv\Scripts\python.exe manage.py revisar_vencimientos     # cron diario

# Frontend (desde frontend/)
npm run dev        # http://localhost:5181  (usar localhost, no 127.0.0.1)
npm run lint       # oxlint
npm run build      # tsc -b + vite build → frontend/dist (lo sirve Django)
```

El `manage.py` de la raíz del repo está roto (auditoría A-08): usar siempre
`backend/manage.py`. Arranque completo de la Suite en local:
`.\iniciar.ps1 -Modo planificacion` desde el repo del Portal.

## 8. Estado (septiembre 2026)

- Fases 0–3 implementadas y auditadas (tableros, equipos, avisos, checklist,
  historial, menciones, Lista/Calendario/Gantt, dependencias, calendario
  laboral).
- **Fase 4 implementada** (`6e9157a`): app `exportacion` y
  `frontend/src/components/tablero/ImportarDialogo.tsx`; falta abrir el XML en
  un MS Project real.
- **Fase 5 implementada**: etiquetas, campos personalizados y límite suave
  por columna (en `tableros`), y app `plantillas`. Queda fuera: automatizaciones
  y vista de carga de trabajo (ver plan §7).
- Pendientes transversales: MySQL propia (D-06), prueba con sesión real del
  Portal, estado del módulo abierto suelto (opcional), hallazgos de
  [`auditoria-arquitectura.md`](auditoria-arquitectura.md) (los de severidad
  Alta son de configuración de producción).
- Rama de trabajo: `dev`; principal: `main`. Commits cortos en español, sin
  tildes en el asunto (p. ej. «Fase 3: Gantt, Lista y Calendario»).

## 9. Trampas conocidas

- Usar `localhost` y no `127.0.0.1` en el navegador: la cookie del Portal es
  host-only.
- El catch-all de `urls.py` debe seguir excluyendo `assets/`; si captura los
  bundles, la SPA queda en blanco sin errores en el servidor.
- `frontend/src/lib/` estuvo ignorado por un patrón del `.gitignore` (`/lib/`
  ahora anclado a la raíz): verificar que archivos nuevos ahí se versionen.
- Los avisos se envían tras el commit: en tests usar
  `self.captureOnCommitCallbacks(execute=True)` y `core.testing.ConAvisos`.
- Sin `PALDACA_NOTIF_SECRET` no se encola ningún aviso (y queda registrado).
- La caché es por proceso (auditoría A-04).
- El frontend tiene espejos **sin feriados** del cálculo de días y
  vencimientos solo para dibujar y para optimismo; la verdad es el backend.
