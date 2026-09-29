# Módulo `gantt`

> Leer antes de modificar `backend/gantt/` o `frontend/src/components/gantt/`.
> Revisado: 2026-09-28.

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

Gantt propio en HTML + SVG, sin librería (decisión D-05), y `lib/gantt.ts`
(geometría pura: rango, filas agrupadas, rutas de flechas). En
`components/gantt/`:

| Archivo | Qué tiene |
|---|---|
| `VistaGantt.tsx` | La vista: barra de herramientas, estado (zoom, agrupación, selección, arrastre, colocación desde la bandeja, enlace de dependencias, pantalla completa, encaje), desplazamientos y composición de las piezas. |
| `Avance.tsx` | `ResumenAvance` (línea de avance del Gantt visible) y `ResumenGrupo` (barra resumen de un grupo). |
| `Escala.tsx` | `Escala` (meses y días) y `Fondo` (fines de semana, feriados, líneas de filas). |
| `Filas.tsx` | `EtiquetaCard` (columna fija de títulos) y `Barra` (barra con tiradores). |
| `Dependencias.tsx` | `Flechas` (SVG) y `PanelDependencia` (editar tipo, desfase, quitar). |
| `Bandeja.tsx` | `BotonBandeja` y la bandeja «Sin fechas» (panel plegable sobre la línea de tiempo) para arrastrar tarjetas a la línea de tiempo. |
| `Ayuda.tsx` | `InterruptorSucesoras` y `AyudaSucesoras` (botón redondo «?»: qué es una sucesora, cómo crearla y qué hace «Mover sucesoras»). |
| `tipos.ts` | `ALTO_ESCALA` y los tipos `Modo`, `Enlace`, `Colocando` que comparten. |

Agrupar por columna/responsable/urgencia, zoom día/semana/mes, flechas
incumplidas en rojo punteado, interruptor «Mover sucesoras» con su ayuda «?»
(se abre con clic: qué es una sucesora, las tres formas de crearla y qué pasa
activado y desactivado).

Pensado para que un equipo cargue su plan y quien lo dirige siga el avance
sin esfuerzo:

- **«+ Tarea»** (`components/tablero/NuevaTareaDialogo`, compartido con el
  Calendario; también en el estado vacío): título,
  responsable (tú por defecto), inicio, fin y urgencia en un paso; la columna
  es la primera que entra en el Gantt. «Crear y añadir otra» deja la
  siguiente empezando el día hábil después, con la misma duración. Las
  fechas propuestas cuentan de lunes a viernes (`lib/dias.ts`, sin feriados);
  la tarea nueva se lleva a la vista y se resalta 2,5 s.
- **Crear una sucesora** (tarea que va después de otra): el «+» que aparece
  al pasar el ratón por una fila del Gantt abre «Nueva tarea» con «Empieza
  después de» ya elegido; ese campo también está en «+ Tarea». Crea la
  tarjeta y después la dependencia fin → inicio (dos peticiones: si la
  segunda falla, la tarjeta queda y se avisa). Con predecesora, «Crear y
  añadir otra» encadena la siguiente tras la recién creada. La tercera forma
  sigue siendo arrastrar desde el punto al final de una barra.
- **Bandeja «Sin fechas» plegable**: se abre con el botón «Sin fechas (n)» de
  la barra o con «n sin fechas» del resumen, y flota sobre la derecha de la
  línea de tiempo (antes era una columna fija que restaba ~260 px). Mientras
  se arrastra una tarjeta se vuelve transparente, sin desmontarse (perdería
  la captura del puntero); la tarjeta arrastrada se dibuja en un portal.
- **Encajar** (`encaje` en `lib/gantt.ts`): elige el zoom más cercano en el
  que caben todas las barras visibles (con 2 días de margen) y centra ese
  tramo. Si no caben ni en «Mes», va al principio en «Mes».
- **Pantalla completa** (`hooks/usePantallaCompleta`): el Gantt pasa a un
  portal en `<body>` con `fixed inset-0` (un ancestro con `transform` rompería
  el `fixed`) y se pide la pantalla completa del **documento**, no del Gantt:
  diálogos, menús y globos van en portales y quedarían fuera. Oculta
  `#paldaca-nav-root` (la barra de la Suite, z-index ~1050) con
  `html[data-pantalla-completa]`. Esc sale, salvo con un diálogo o panel
  abierto. Al entrar y salir el cuerpo se vuelve a montar: se recupera el
  desplazamiento. Funciona también dentro del Portal (su iframe tiene
  `allow="fullscreen"`).
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
  (`cancelarArrastre`), sin abrir la tarjeta. Tiradores, conector, «Mover
  sucesoras» y el «+» de las filas se ocultan (la ayuda «?» y «+ Tarea» con
  «Empieza después de» siguen). En el teléfono «Sin fechas», «Hoy» y
  «Encajar» quedan solo con su icono.
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
