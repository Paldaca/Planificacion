# Módulo `gantt`

> Leer antes de modificar `backend/gantt/` o `frontend/src/components/gantt/`.
> Revisado: 2026-09-26.

## Responsabilidad

Reglas de la vista Gantt que no son de una tarjeta suelta: **dependencias**
entre tarjetas y **reprogramación** de sucesoras en días hábiles. Qué tarjetas
entran en el Gantt lo decide `tableros` (`Card.entra_en_gantt()`); las vistas
Lista y Calendario no tienen app propia (leen las tarjetas de `tableros`).

## Regla de inclusión (vive en `tableros`)

Una tarjeta entra en el Gantt si tiene **inicio y fin** y
(`en_gantt = si`) o (`en_gantt = heredar` y su columna tiene
`incluir_en_gantt = true`).

## Modelo

`Dependencia` (`planificacion_dependencia`): `predecesora`, `sucesora`,
`tipo` (`fin_inicio` por defecto, `inicio_inicio`, `fin_fin`), `desfase_dias`
(días **hábiles**; negativo = solape), `creada_por`. Única por
(predecesora, sucesora); `CheckConstraint` que impide depender de sí misma.

## Servicios

`services/dependencias.py`:

- Semántica (días hábiles):
  - fin → inicio: la sucesora empieza ≥ día hábil siguiente al fin + desfase.
  - inicio → inicio: la sucesora empieza ≥ inicio de la predecesora + desfase.
  - fin → fin: la sucesora termina ≥ fin de la predecesora + desfase.
  - Empezar en un día no hábil cuenta como empezar el siguiente hábil.
- `crear_dependencia` (rechaza ciclos, repetidas, a sí misma y entre
  tableros), `editar_dependencia`, `eliminar_dependencia`, `restriccion`,
  `viola`, `incumple` (se expone como `incumplida` en la API).

`services/programacion.py` → `programar(card, *, actor, ...)` (nuevas fechas y
`mover_sucesoras`):

- Solo empuja **hacia adelante**; la sucesora conserva su duración hábil.
- No mueve tarjetas terminadas ni sin fechas.
- Cada cambio pasa por `tableros.services.tarjetas.editar_card` (mismo
  historial, avisos y vencimientos que una edición a mano).

`receivers.py`: escucha `tableros.signals.tarjeta_trasladada` y borra las
dependencias de la tarjeta trasladada (las dependencias no cruzan tableros).

## API (`/api/v1/`)

| Ruta | Operaciones |
|---|---|
| `tableros/<id>/dependencias/` | listar (con `incumplida`), crear |
| `dependencias/<id>/` | cambiar tipo o desfase (PATCH), quitar (DELETE) |
| `cards/<id>/programar/` | nuevas fechas y, con `mover_sucesoras`, empujar la cadena; devuelve las tarjetas cambiadas (409 si la `version` está vieja) |

Las tarjetas y sus fechas vienen del mismo detalle de tablero que usa el
Kanban: un cambio en una vista se ve de inmediato en la otra.

## Frontend

`components/gantt/VistaGantt.tsx` (Gantt propio en HTML + SVG, sin librería,
decisión D-05) y `lib/gantt.ts` (geometría pura: rango, filas agrupadas,
rutas de flechas). Agrupar por columna/responsable/urgencia, zoom
día/semana/mes, bandeja «Sin fechas» (solo si hay tarjetas sin fechas; si no,
la línea de tiempo usa todo el ancho), flechas incumplidas en rojo punteado,
interruptor «Mover sucesoras».

Pensado para que un equipo cargue su plan y quien lo dirige siga el avance
sin esfuerzo:

- **«+ Tarea»** (`NuevaTareaDialogo`, también en el estado vacío): título,
  responsable (tú por defecto), inicio, fin y urgencia en un paso; la columna
  es la primera que entra en el Gantt. «Crear y añadir otra» deja la
  siguiente empezando el día hábil después, con la misma duración. Las
  fechas propuestas cuentan de lunes a viernes (`lib/dias.ts`, sin feriados);
  la tarea nueva se lleva a la vista y se resalta 2,5 s.
- **Resumen de avance** (`ResumenAvance`): % terminado, vencidas, por vencer y
  sin fechas del Gantt visible; «vencidas / vencen pronto» filtra el tablero a
  lo atrasado (`onVerAtrasadas`).
- **Avance por grupo** (`avanceDe` en `lib/gantt.ts`): cada cabecera muestra
  «hechas/total» y las vencidas, y en la línea de tiempo una barra resumen
  (primer inicio – último fin, rellena por lo terminado). Agrupado por
  responsable es la vista del jefe: cómo va cada persona.
- Desplazamientos (`irAHoy`, tarea nueva): descuentan la columna fija de
  títulos, que tapa la izquierda de la línea de tiempo.

Carga (medida con un tablero de 400 tarjetas y 200 dependencias):

- El código del Gantt se pide al montar `TableroPage` (en paralelo con los
  datos) y al acercarse al botón «Gantt», con `hooks/useModuloDiferido`, **no**
  con `lazy()` + `Suspense`: React 19 retrasa hasta 300 ms el contenido que
  suspendió aunque el código ya esté descargado.
- Las dependencias se piden junto con el tablero (`useDependencias` en
  `TableroPage` con `vista === "gantt"`), no tras el primer render.
- Al entrar se centra hoy en horizontal y se baja hasta la primera tarjeta que
  sigue abierta hoy (también con el botón «Hoy»); al cambiar el zoom solo se
  recoloca en horizontal.
- `Barra`, `EtiquetaCard`, `Escala` y `Fondo` están memoizados y reciben
  manejadores estables (`hooks/useEstable`): resaltar una fila o arrastrar una
  barra no vuelve a pintar las demás. Al añadir props a esas filas, añadirlas
  también a su comparación en `memo`.
- En táctil (`pointer-coarse`) las barras y la bandeja usan `touch-action:
  auto`: deslizar desplaza el Gantt y tocar abre la tarjeta. Si el navegador
  toma el gesto, llega `pointercancel` y el arrastre se descarta
  (`cancelarArrastre`), sin abrir la tarjeta. Tiradores, conector y «Mover
  sucesoras» se ocultan.
- El panel de una dependencia va en un portal, pero sus eventos suben en React
  hasta el área del Gantt (que cierra la selección): por eso detiene
  `pointerdown`.

## Dependencias

- Depende de: `core`, `calendario`, `tableros` (modelos, servicios,
  `api.views.comunes`, `api.serializers` — ver auditoría A-06).
- Lo usa: `exportacion` (modelo `Dependencia`, `crear_dependencia`).

## Pruebas

`tests/test_gantt.py` (ciclos, tipos, desfase, reprogramación, traslado).

## Cuidado al modificar

- La geometría va en `lib/gantt.ts`; las reglas (inclusión, dependencias,
  reprogramación) las decide el backend.
- Cualquier cambio de fechas debe pasar por `editar_card`, nunca `save()`
  directo sobre la tarjeta.
- Criterios de aceptación de la fase 3: un cambio en el Gantt se ve en el
  Tablero y viceversa; cambiar `incluir_en_gantt` de una columna no toca las
  tarjetas; una dependencia circular se rechaza con un mensaje claro.

## Relacionado

[`calendario.md`](calendario.md) · [`tableros.md`](tableros.md) ·
[`exportacion.md`](exportacion.md) (MS Project mapea dependencias a vínculos).
