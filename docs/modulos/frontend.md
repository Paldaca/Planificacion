# Módulo `frontend` (SPA React)

> Leer antes de modificar `frontend/`. Revisado: 2026-09-26.

## Stack

React 19 + TypeScript 6 + Vite 8 (Rolldown) · Tailwind CSS 4 (`@theme` en
`src/index.css`) · TanStack Query 5 (estado de servidor) · React Router 7 ·
dnd-kit (arrastrar y soltar accesible) · Radix UI (diálogos, menús, tooltips)
· Motion (animaciones, `reducedMotion="user"`) · sonner (toasts) ·
lucide-react (iconos) · oxlint (lint). Alias `@/` → `src/`.

Dev: `npm run dev` en `http://localhost:5181` (puerto fijo; usar `localhost`,
no `127.0.0.1`). Build: `npm run build` (`tsc -b && vite build`) → `dist/`,
que Django sirve en producción (`WHITENOISE_ROOT` + `spa_shell`).

## Estructura de `src/`

| Carpeta | Contenido |
|---|---|
| `api/` | `client.ts` (`apiFetch`: `credentials: "include"`, `X-CSRFToken`, `ApiError`, `mensajeError`), `queries.ts` (hooks de TanStack Query y las claves `claves.*`), `configuracion.ts` (etiquetas y campos del tablero), `plantillas.ts` (plantillas de tablero), `tipos.ts` (formas de la API `/api/v1/`). Los módulos nuevos de hooks van en su propio archivo (A-11) y reutilizan `avisarError`/`claves` de `queries.ts`. |
| `auth/` | `useIdentity` (llama `GET /api/auth/me/` → loading / ok / unauthorized / forbidden / unavailable), `IdentidadProvider` / `useIdentidad`, `redirectToPortalLogin`, `StatusScreen` |
| `embed/` | `protocol.ts` (contrato `paldaca-embed` v1, espejo del parser del Portal), `usePaldacaEmbed` (avisa `ready`/`navigate`/`session-expired`/`forbidden` al shell), `usePaldacaNav` (barra de la Suite al abrirse suelta; menú propio de respaldo a los 8 s) |
| `pages/` | Una por ruta, cargadas con `lazy()`: `MisTareasPage`, `TablerosPage`, `TableroPage` (+ `TarjetaAbierta`), `EquiposPage`, `EquipoPage`, `InvitacionesPage` |
| `components/ui/` | Primitivas propias: `Boton`, `Campos`, `Dialogo`, `Menu`, `Avatar`, `Estados` (`Vacio`, `Esqueleto`) |
| `components/<dominio>/` | `tablero/` (Kanban, columnas, tarjeta, filtros, alta rápida, importar, `ConfiguracionDialogo` de etiquetas y campos, `LimiteColumnaDialogo`), `card/` (diálogo de la tarjeta, checklist, comentarios, menciones, historial, `EtiquetasYCampos`), `vistas/` (Lista, Calendario, calendario laboral), `gantt/`, `plantillas/` (guardar y listar plantillas), `equipos/` (incluye `TableroDialogo` con el selector «Empezar con»), `invitaciones/`, `layout/` (Shell, Encabezado) |
| `hooks/` | `useVista` (`?vista=` + última usada por tablero), `usePreferencia` (localStorage con prefijo `planificacion:`), `useTitulo`, `useAlAbrir`, `useModuloDiferido` (vistas pesadas sin `Suspense`), `useEstable` (manejadores con identidad estable para filas memoizadas), `useConfigTablero` (contexto con las etiquetas y los campos del tablero para dibujar tarjetas; lo provee `TableroPage`, fuera de un tablero queda vacío) |
| `lib/` | Lógica pura, sin React: `fechas`, `dias`, `calendarioMes`, `gantt` (geometría), `filtros`, `vencimiento`, `estilos` (colores de dominio), `actividadUsuario` (refresco vivo), `cn` |

## Rutas

`/` → `/mis-tareas` · `/tableros` · `/tableros/:tableroId?vista=tablero|lista|calendario|gantt`
· `/tableros/:tableroId/cards/:numero` (tarjeta abierta como modal sobre el
tablero) · `/equipos` · `/equipos/:equipoId` · `/invitaciones`. Todas son
enlazables también dentro del iframe del Portal (cada navegación emite
`navigate`).

## Datos (TanStack Query)

- `staleTime` 15 s, refresco al volver a la pestaña, sin reintentos en 4xx.
- Ediciones de tarjeta **optimistas** y **en serie por tarjeta** (`scope`):
  cada PATCH lee la `version` vigente justo antes de salir, así dos cambios
  seguidos no chocan con un 409 falso. Un 409 real reemplaza la tarjeta por la
  versión del servidor y lo avisa con un toast.
- Refresco automático solo con la pestaña visible **y** actividad del usuario
  en los últimos 10 min (`lib/actividadUsuario.ts`, riesgo R-07 del contrato
  SSO: no mantener viva la sesión del Portal sin nadie delante).
- 401 a mitad de uso → `registrarSesionExpirada` revalida la identidad.

## Sistema visual

Mismo del Portal: Poppins (títulos) + Geist Sans (texto); tokens
`--color-morado #32407b`, `--color-marino #141644`, `--color-rojo #ed2546`
(solo para lo urgente/destructivo), `--color-texto`, `--color-tenue`,
`--color-linea`, `--color-fondo`, `--color-columna`; curva
`--ease-suave cubic-bezier(0.22, 1, 0.36, 1)`. Urgencia con escala propia
(`lib/estilos.ts`). Diseño adaptable: el tablero se usa en el celular.

## Reglas

- El frontend **refleja** permisos y reglas (vienen en `permisos` del
  tablero); nunca decide si algo está permitido.
- Espejos locales permitidos solo para dibujar u optimismo, documentados como
  tales (`lib/vencimiento.ts` y `lib/dias.ts`, **sin feriados**; el servidor
  reemplaza el cálculo en cuanto responde).
- Fechas de la API son días `"YYYY-MM-DD"`: parsear con `parsearDia` (fecha
  local), nunca `new Date("YYYY-MM-DD")` (se corre por zona horaria).
- Textos de interfaz en español, tuteo; a la tarjeta se le dice «tarjeta».
- Los menús de la Suite se editan en el Portal (`navigationConfig.ts`); aquí
  no se repiten ítems.
- `embed/protocol.ts` es un contrato Suite-wide: cambiarlo exige cambiar
  `Portal-Paldaca/frontend/src/components/module-frame/protocol.ts`.
- Filtros (`lib/filtros.ts`, incluidas las etiquetas) = los de
  `exportacion/services/datos.py::Filtros`. Un filtro de etiqueta que ya no
  existe se descarta en `TableroPage` (`vigentes`) para no dejar el tablero
  vacío sin chip que quitar.
- Vistas pesadas (Gantt, Calendario): cargarlas con `moduloDiferido` /
  `useModuloDiferido`, no con `lazy()` + `Suspense` (React 19 retrasa hasta
  300 ms el contenido que suspendió). Ver `docs/modulos/gantt.md` §Carga.
- Campos que aparecen con una animación (`AnimatePresence mode="wait"`): dar
  el foco con `autoFocus`, no con un efecto (el campo se monta después).
- Límite de tarjetas por columna: se cuenta sobre **todas** las tarjetas de la
  columna (no las filtradas) y solo avisa (toast + contador ámbar/rojo); la
  regla es suave (D-13).

## Variables de entorno (`.env.development` / `.env.production`)

`VITE_API_BASE_URL` (vacía en producción: mismo origen), `VITE_PALDACA_PORTAL_URL`,
`VITE_PALDACA_NAV_URL`, `VITE_PALDACA_PORTAL_API_URL`.

## Calidad

- `npm run build` (incluye `tsc -b` estricto: `noUnusedLocals`,
  `noUnusedParameters`, `erasableSyntaxOnly`) y `npm run lint` (oxlint).
- **No hay pruebas automáticas** del frontend (auditoría A-10). `lib/` es puro
  y es el primer candidato a Vitest.
- Archivos grandes a dividir cuando se toquen: `components/gantt/VistaGantt.tsx`
  (~1100 líneas), `api/queries.ts` (~1000), `components/card/CardDialogo.tsx`
  (~800) (auditoría A-11).

## Relacionado

[`arquitectura.md`](../arquitectura.md) §Frontend · [`paldaca_sso.md`](paldaca_sso.md)
· [`tableros.md`](tableros.md) · [`gantt.md`](gantt.md).
