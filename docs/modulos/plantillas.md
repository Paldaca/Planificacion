# Módulo `plantillas` (fase 5)

> Leer antes de modificar `backend/plantillas/` o
> `frontend/src/components/plantillas/`. Revisado: 2026-09-26.

## Responsabilidad

Plantillas de tablero: guardar un tablero como molde y crear tableros nuevos
desde él. Una plantilla es una **foto** (JSON) de columnas, etiquetas, campos
personalizados y tarjetas con fechas **relativas en días hábiles**, checklist
y dependencias (D-15). No guarda personas, comentarios, historial ni tarjetas
archivadas.

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
