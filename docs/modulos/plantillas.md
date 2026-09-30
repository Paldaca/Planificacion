# Módulo `plantillas` (fase 5)

> Leer antes de modificar `backend/plantillas/` o
> `frontend/src/components/plantillas/`. Revisado: 2026-09-30.

## Responsabilidad

Plantillas de tablero: guardar un tablero como molde y crear tableros nuevos
desde él. Una plantilla es una **foto** (JSON) de columnas, etiquetas (con su marca de hito), campos
personalizados y tarjetas con fechas **relativas en días hábiles**, checklist
y dependencias (D-15). No guarda personas, comentarios, adjuntos, historial ni
tarjetas archivadas.

No confundir con la *plantilla de importación* (un Excel vacío) de
[`exportacion`](exportacion.md).

## Modelo

`Plantilla` (`planificacion_plantilla`): `nombre`, `descripcion`, `alcance`
(personal/equipo/global), `propietario` (solo personal), `equipo` (solo de
equipo), `contenido` (JSON versionado), `creada_por`, `creada_en`,
`actualizada_en`. `CheckConstraint` `plantilla_alcance_coherente`
(alcance ↔ dueño). Lectura: `Plantilla.objects.visibles_para(usuario)` (las
globales, las propias y las de sus equipos no archivados).

## Formato del `contenido` (`FORMATO = 1`)

Descrito en el docstring de `services/plantillas.py`. Lo esencial:

- Columnas por orden con `es_final`, `incluir_en_gantt` y `limite_cards`.
- `ayuda` (opcional): la guía del Centro de ayuda, {`titulo`, `resumen`,
  `entradas`: [{`id`, `titulo`, `parrafos`}]}. `foto` la toma del tablero y
  `crear_tablero_desde` la pasa a `crear_tablero`, que la limpia
  (`tableros.services.tableros.limpiar_ayuda`: solo texto, con límites).
- Tarjetas con la columna por **índice**, etiquetas y campos por **nombre**
  (los ids cambian en el tablero nuevo) y dependencias por `ref` interna.
- `inicio`/`fin`: días hábiles desde el primer día hábil del proyecto (la
  fecha más temprana del tablero); `null` si la tarjeta no tiene fecha.

Si alguna vez cambia el formato, subir `FORMATO` y seguir leyendo el anterior
(`crear_tablero_desde` rechaza con `ReglaDeNegocio` un formato desconocido).

## Servicios (`services/plantillas.py`)

| Función | Qué hace |
|---|---|
| `foto(tablero)` | El `contenido` a partir de lo activo del tablero. Máx. `MAX_TARJETAS` (500). |
| `resumen(contenido)` | Para listar: columnas, tarjetas, etiquetas, campos y duración en días hábiles. |
| `guardar_como_plantilla(tablero, *, nombre, descripcion, alcance, equipo, actor)` | Crea la plantilla. |
| `editar_plantilla`, `eliminar_plantilla` | Nombre y descripción; borrar no toca los tableros creados con ella. |
| `crear_tablero_desde(plantilla, *, nombre, fecha_inicio, equipo=None, actor)` | Tablero nuevo (personal si no hay `equipo`) en **una** transacción: columnas, etiquetas, campos, tarjetas (`crear_card(avisar=False)`), checklist y dependencias. Las fechas empiezan en `fecha_inicio` (o el siguiente día hábil) y se suman con el calendario laboral, feriados incluidos. |

## Plantillas del sistema (`services/del_sistema.py`)

Plantillas **escritas en el código** (no sacadas de un tablero), para que
queden versionadas y salgan iguales en cada instalación. Son la metodología
del departamento ([`metodologia-de-trabajo.md`](../metodologia-de-trabajo.md))
llevada a tableros. `PLANTILLAS` es la lista; `instalar(*, actualizar=False,
equipo=None)` crea las que falten.

```powershell
..\venv\Scripts\python.exe manage.py instalar_plantillas              # globales: las ve todo el módulo
..\venv\Scripts\python.exe manage.py instalar_plantillas --equipo 3   # del equipo 3: solo sus miembros
..\venv\Scripts\python.exe manage.py instalar_plantillas --actualizar # repone el contenido desde el código
```

- **Globales o de un equipo.** Sin `--equipo` son globales (las gestiona el
  administrador del módulo). Con `--equipo <id>` se crean como plantillas de
  ese equipo: solo las ven sus miembros y las gestionan sus administradores.
  Las dos formas conviven; un id que no existe lista los equipos activos.
- Se reconocen **por el nombre y el alcance**: la que existe no se vuelve a
  crear ni se pisa sin `--actualizar`. Si se renombra, la siguiente
  instalación crea otra.
- No tienen `creada_por`.
- Cada una trae una tarjeta **«Tutorial: cómo se trabaja en este tablero»**
  (sin fecha, en la primera columna) con la metodología en la descripción y
  los primeros pasos en el checklist; se archiva al terminar de leerla.
- Cada una trae además **su propia guía del Centro de ayuda**
  (`services/guias.py`: `GUIA_PROYECTO`, `GUIA_SOPORTE`), en la clave `ayuda`
  del contenido. Se copia al tablero (`Tablero.ayuda`) y el Centro de ayuda la
  muestra como una pestaña más **solo en ese tablero**. Si cambia la
  metodología, se cambia la guía y se corre `instalar_plantillas
  --actualizar` (los tableros ya creados conservan la suya).
- El comando no corre solo al desplegar: hay que ejecutarlo una vez (en
  pruebas, a mano).

**«Proyecto de software»** (en prueba, 2026-09-30): la metodología de
desarrollo por módulos llevada a tarjetas sin nada nuevo en el programa.

| Pieza | Cómo queda |
|---|---|
| Estado | Columnas Pendientes (fuera del Gantt) · Planificado · En curso · En revisión · Hecho |
| Fase | Campo de lista «Fase»: `Fase 0 · Configuración`, `Fase 1…3 · Módulo n`, `Cierre` (se renombran en cada tablero) |
| Requisito | Campo de texto «Requisito» (`HU-1.1`…); «Rama» para la rama o el PR |
| Tipo de trabajo | Etiquetas Documentación, Desarrollo, Pruebas, Error, Hotfix, Cambio mayor, Bloqueada |
| Hito | Tarjeta de un día con la etiqueta «Hito» (marcada `es_hito`: un rombo en el Gantt) al cierre de cada fase; filtrar por ella deja el Gantt solo con los hitos |
| Tareas | 27 tarjetas: el tutorial en Pendientes, 5 de Fase 0, 6 por módulo (documentar, 3 historias, pruebas, revisión) y 3 de cierre; 67 días hábiles |

**«Soporte»**: un solo tablero para lo que el departamento atiende sin ser un
proyecto. Es solo soporte: no lleva el día a día del departamento.

| Pieza | Cómo queda |
|---|---|
| Estado | Columnas Entrada · En atención · Esperando · Resuelto (final), **todas fuera del Gantt** |
| Tipo | Etiquetas Incidencia, Solicitud, Mantenimiento |
| Datos | Campo de lista «Sistema» (Portal, Nómina, Hoja de Tiempo, Planificación, Equipos y red, Otro: se ajusta en cada tablero) y de texto «Solicitante» |
| Tarjetas | El tutorial y un ejemplo de incidencia, sin fechas |

El límite de «En atención» no viene puesto (depende de cuántas personas sean):
es uno de los primeros pasos del tutorial.

Para cambiar el plan tipo se edita `del_sistema.py` y se corre el comando con
`--actualizar`. En el Gantt, «Agrupar: Fase» muestra el resumen de cada fase
(ver [`gantt.md`](gantt.md)).

## Permisos (`permisos.py`)

| Acción | Personal | De equipo | Global |
|---|---|---|---|
| Verla y usarla | quien la creó | miembros del equipo | todos |
| Crearla, renombrarla, borrarla | quien la crea | administradores del equipo | administrador del módulo |

- Para guardar hay que poder **ver** el tablero de origen.
- Usarla para un tablero de equipo exige administrar ese equipo (lo mismo que
  crear un tablero); sin equipo, el tablero es personal.

## API (`/api/v1/`)

| Ruta | Operaciones |
|---|---|
| `plantillas/` | listar las visibles (con `resumen` y `permisos.gestionar`) · crear desde un tablero (`tablero`, `nombre`, `descripcion`, `alcance`, `equipo`) |
| `plantillas/<id>/` | ver · renombrar/describir · eliminar |
| `plantillas/<id>/usar/` | crear un tablero (`nombre`, `equipo`, `fecha_inicio`) → `{"tablero": id}` |

## Frontend

`src/api/plantillas.ts` (hooks), `components/plantillas/GuardarPlantillaDialogo`
(menú «…» del tablero → «Guardar como plantilla…»),
`components/plantillas/PlantillasDialogo` (botón «Plantillas» en Tableros:
listar, usar, renombrar, eliminar) y el selector «Empezar con» de
`TableroDialogo` (`components/equipos/Dialogos.tsx`).

## Dependencias

- Depende de: `core`, `calendario`, `equipos`, `tableros` (incluido
  `api.views.comunes.obtener_tablero`, como `exportacion`: auditoría A-06),
  `gantt` (para las dependencias). Está en la capa superior, junto a
  `exportacion`.
- No lo usa ninguna otra app.

## Pruebas

`tests/test_plantillas.py`: `GuardarTests` (foto con fechas relativas,
alcance según rol, quién ve y gestiona) y `UsarTests` (tablero con todo y
fechas recalculadas; personal sin equipo y permisos).
`tests/test_del_sistema.py`: instalar es idempotente, `--actualizar` repone,
las globales las ven todos, las de un equipo solo sus miembros (`--equipo`),
el tablero de proyecto sale completo (columnas, fases, hitos por la etiqueta
marcada, fechas con feriado, ninguna dependencia perdida ni incumplida y el
tutorial) y el de soporte queda fuera del Gantt.

## Cuidado al modificar

- Nada de ids en el `contenido`: índices y nombres, para que sea portable.
- Crear siempre con los servicios de `tableros` y `gantt` (validaciones,
  límites y reglas de ciclo incluidas); nunca `objects.create` de tarjetas.
- Todo campo nuevo de columna, tarjeta, etiqueta o campo que deba viajar en la
  plantilla va en `foto` **y** en `crear_tablero_desde` (prueba de ida y
  vuelta en `UsarTests`).

## Relacionado

[`plan-modulo-planificacion.md`](../plan-modulo-planificacion.md) §7 Fase 5 ·
[`tableros.md`](tableros.md) · [`calendario.md`](calendario.md).
