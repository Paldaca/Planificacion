# Módulo `frontend` (SPA React)

> Leer antes de modificar `frontend/`. Revisado: 2026-09-30.

## Stack

React 19 + TypeScript 6 + Vite 8 (Rolldown) · Tailwind CSS 4 (`@theme` en
`src/index.css`) · TanStack Query 5 (estado de servidor) · React Router 7 ·
dnd-kit (arrastrar y soltar accesible) · Radix UI (diálogos, menús, tooltips)
· Motion (animaciones, `reducedMotion="user"`) · sonner (toasts) ·
lucide-react (iconos) · oxlint (lint). Alias `@/` → `src/`.

Dev: `npm run dev` en `http://localhost:5181` (puerto fijo; usar `localhost`,
no `127.0.0.1`). Build: `npm run build` (`tsc -b && vite build`) → `dist/`,
que Django sirve en producción (`WHITENOISE_ROOT` + `spa_shell`).

**Dentro del Portal en local** el iframe carga ese build servido por Django
(`:8007`), no Vite: `iniciar.ps1` solo compila al arrancar, así que lo que se
cambia después no llega al Portal hasta recompilar. Por eso el script abre
también una pestaña con `npm run build:watch` (`vite build --watch`:
recompila `dist/` al guardar; clave `recompilar` de su `scripts/modulos.py`);
basta recargar el Portal con F5. A mano: `npm run build:watch` en `frontend/`. No revisa tipos: antes de commitear,
`npm run build`. Una pestaña abierta sigue con el build anterior hasta
recargar (y puede fallar al cambiar de vista: el build nuevo borra los chunks
viejos).

## Estructura de `src/`

| Carpeta | Contenido |
|---|---|
| `api/` | `client.ts` (`apiFetch`: `credentials: "include"`, `X-CSRFToken`, `ApiError`, `mensajeError`), `queries.ts` (hooks de TanStack Query y las claves `claves.*`), `configuracion.ts` (etiquetas y campos del tablero), `favoritos.ts` (`useFavorito`, optimista en el listado, el tablero y los del equipo), `plantillas.ts` (plantillas de tablero), `tipos.ts` (formas de la API `/api/v1/`). Los módulos nuevos de hooks van en su propio archivo (A-11) y reutilizan `avisarError`/`claves` de `queries.ts`. |
| `auth/` | `useIdentity` (llama `GET /api/auth/me/` → loading / ok / unauthorized / forbidden / unavailable), `IdentidadProvider` / `useIdentidad`, `redirectToPortalLogin`, `StatusScreen` |
| `embed/` | `protocol.ts` (contrato `paldaca-embed` v1, espejo del parser del Portal), `portal.ts` (URL del Portal: la `<meta name="paldaca-portal-url">` que escribe Django, o `VITE_PALDACA_PORTAL_URL` con Vite), `usePaldacaEmbed` (avisa `ready`/`navigate`/`session-expired`/`forbidden` al shell, con la ruta sin `paldaca_embed`), `usePaldacaNav` (barra de la Suite al abrirse suelta; menú propio de respaldo a los 8 s) |
| `pages/` | Una por ruta, cargadas con `lazy()`: `MisTareasPage`, `TablerosPage`, `TableroPage` (+ `TarjetaAbierta`), `EquiposPage`, `EquipoPage`, `InvitacionesPage` |
| `components/ui/` | Primitivas propias: `Boton`, `Campos`, `Dialogo`, `Menu`, `Avatar`, `Estados` (`Vacio`, `Esqueleto`) |
| `components/<dominio>/` | `ayuda/` (Centro de ayuda: `CentroAyuda` con `ProveedorAyuda`, y su texto en `contenido.ts`; `BotonAyuda`, el «?» redondo con una explicación corta y enlace a la guía, usado en el Gantt y en «Etiquetas y campos»), `tablero/` (Kanban, columnas, tarjeta, filtros, alta rápida, `NuevaTareaDialogo` que comparten Gantt y Calendario, `ExportarPdfDialogo` («Gantt en PDF»: escala, periodo y hoja; recibe `ConfigGantt` del Gantt o de las preferencias guardadas), `BotonFavorito` (estrella: en `MosaicoTablero`, fuera del enlace, y junto al nombre del tablero abierto), importar, `ConfiguracionDialogo` de etiquetas y campos con `EditorOpciones` (las opciones de una lista, una por fila: añadir con Enter o pegando varias, renombrar, ordenar y quitar), `LimiteColumnaDialogo`), `card/` (diálogo de la tarjeta, checklist, comentarios, menciones, historial, `EtiquetasYCampos`), `vistas/` (Lista, Calendario, `CalendarioMovil`, calendario laboral), `gantt/`, `plantillas/` (guardar y listar plantillas), `equipos/` (incluye `TableroDialogo` con el selector «Empezar con»), `invitaciones/`, `layout/` (Shell, Encabezado) |
| `hooks/` | `useVista` (`?vista=` + última usada por tablero), `usePreferencia` (localStorage con prefijo `planificacion:`; `leerPreferencia` para leer una sin suscribirse), `useTitulo`, `useAlAbrir`, `useModuloDiferido` (vistas pesadas sin `Suspense`), `useEstable` (manejadores con identidad estable para filas memoizadas), `usePantallaCompleta` (vista a toda la ventana + pantalla completa del documento; ver `gantt.md`), `useAyuda` / `useTemaAyuda` (abrir el Centro de ayuda; la pantalla declara con qué tema abre), `useConfigTablero` (contexto con las etiquetas y los campos del tablero para dibujar tarjetas; lo provee `TableroPage`, fuera de un tablero queda vacío) |
| `lib/` | Lógica pura, sin React: `fechas`, `dias`, `calendarioMes`, `gantt` (geometría), `filtros`, `opciones` (límites de una lista y cómo se leen de un texto pegado), `vencimiento`, `estilos` (colores de dominio), `actividadUsuario` (refresco vivo), `cn` |

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
- **Centro de ayuda** (`components/ayuda/`): panel lateral con una guía por
  vista (Tablero, Lista, Calendario, Gantt) y preguntas frecuentes, con
  buscador (sin acentos ni mayúsculas). Se abre con «Ayuda» en la cabecera del
  tablero (en la guía de la vista actual: `useTemaAyuda(vista)`), con la tecla
  `?` fuera de un campo de texto y sin otro diálogo abierto, o desde otra ayuda
  (`useAyuda().abrir("gantt", "sucesoras")`, como el «?» del Gantt). Lo provee
  `ProveedorAyuda` en `App`. **Si cambias cómo funciona algo que la ayuda
  explica, cambia su texto en `contenido.ts` en el mismo cambio.**
- **Crear tareas desde el Calendario**: clic en un día abre «Nueva tarea» con
  ese día como inicio y fin; arrastrar sobre varios días (puntero capturado
  por la celda, `data-dia` bajo el puntero) la abre con ese tramo; también
  «+ Tarea» en su barra y, en el teléfono, «Nueva tarea este día». Usa
  `NuevaTareaDialogo` con `origen="calendario"`: ofrece todas las columnas
  que no son finales, sin «Empieza después de», y «Crear y añadir otra»
  conserva las fechas.
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
- **Opciones de un campo de lista** (`EditorOpciones`): cada cambio envía la
  lista entera, así que `useEditarCampo` va **en serie** (`scope`) y, con el
  editor abierto, manda la copia local de `FilaCampo`, no la caché (un
  refresco del tablero a mitad de varios cambios seguidos la dejaría vieja y el
  siguiente clic caería en otra opción). Renombrar manda `renombrar` para que
  el servidor cambie también las tarjetas; al vaciarse la cola se vuelve a
  pedir el tablero.
- Límite de tarjetas por columna: se cuenta sobre **todas** las tarjetas de la
  columna (no las filtradas) y solo avisa (toast + contador ámbar/rojo); la
  regla es suave (D-13).

## Teléfono

Probado a 375 px dentro del Portal (`iniciar.ps1 -Modo planificacion`).
Reglas:

- Tamaño con `max-sm:` (ancho) y tacto con `pointer-coarse:` (Tailwind 4):
  con pantalla táctil `Boton` crece a ~40 px; los controles propios que se
  quedan por debajo de 32 px amplían su zona de toque (`pointer-coarse:p-*` o
  un `before:` invisible, como la casilla del checklist).
- Nada que solo aparezca con `group-hover`: en táctil no hay hover. Las
  acciones (borrar un paso, quitar un responsable, editar un comentario) llevan
  `pointer-coarse:opacity-100`; lo que no aplica en táctil se oculta con
  `pointer-coarse:hidden`.
- Cabecera del tablero: en el teléfono vista a todo el ancho y un único menú
  «…» que también trae Archivadas, Exportar e Importar (`ItemMenu` con
  `className="sm:hidden"`); los filtros se pliegan tras «Filtros» con contador.
- Kanban: columnas que encajan al deslizar (`max-sm:snap-mandatory`) y alto
  con `dvh`. Lista: sin la columna «#» y con el título que envuelve.
  Calendario: `CalendarioMovil` (mes compacto + tarjetas del día elegido, con
  «Nueva tarea este día»), sin arrastre. Gantt: deslizar sobre las barras desplaza (tocar abre la tarjeta);
  no se arrastran barras ni se enlazan en táctil.
- La búsqueda usa 16 px en el teléfono (iOS no hace zoom al enfocarla).
- `lib/dias.ts` tiene `siguienteLaborableISO`, `sumarLaborablesISO` y
  `laborablesEntre` (lunes a viernes, **sin feriados**): solo para proponer
  fechas en formularios; lo que cuenta lo calcula el servidor.

## Variables de entorno (`.env.development` / `.env.production`)

`VITE_API_BASE_URL` (vacía en producción: mismo origen), `VITE_PALDACA_PORTAL_URL`
(solo con Vite: en el build servido por Django manda la meta de `spa_shell`),
`VITE_PALDACA_NAV_URL`, `VITE_PALDACA_PORTAL_API_URL`.

## Calidad

- `npm run build` (incluye `tsc -b` estricto: `noUnusedLocals`,
  `noUnusedParameters`, `erasableSyntaxOnly`) y `npm run lint` (oxlint).
- **No hay pruebas automáticas** del frontend (auditoría A-10). `lib/` es puro
  y es el primer candidato a Vitest.
- Archivos grandes a dividir cuando se toquen: `api/queries.ts` (~1000
  líneas) y `components/card/CardDialogo.tsx` (~800) (auditoría A-11).
  `VistaGantt.tsx` ya está dividido en piezas (ver [`gantt.md`](gantt.md)).
- En producción `VITE_PALDACA_PORTAL_API_URL` es `https://cpaldaca.com/api`:
  el Portal sirve su API en el mismo origen (`api.cpaldaca.com` es solo un
  alias opcional).

## Relacionado

[`arquitectura.md`](../arquitectura.md) §Frontend · [`paldaca_sso.md`](paldaca_sso.md)
· [`tableros.md`](tableros.md) · [`gantt.md`](gantt.md).
