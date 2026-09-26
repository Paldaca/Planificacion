# Módulo `gantt`

> Leer antes de modificar `backend/gantt/` o `frontend/src/components/gantt/`.
> Revisado: 2026-09-25.

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
día/semana/mes, bandeja «Sin fechas», flechas incumplidas en rojo punteado,
interruptor «Mover sucesoras».

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
