# Módulo `tableros`

> Leer antes de modificar `backend/tableros/`. Revisado: 2026-09-26.
>
> Es el núcleo del dominio: casi todo cambio funcional pasa por aquí.

## Responsabilidad

Tableros, columnas (con límite de tarjetas), tarjetas (*cards*),
responsables, etiquetas, campos personalizados, comentarios con menciones,
checklist, historial (actividad), vencimientos y avisos de colaboración, *Mis
tareas* y traslado de tarjetas entre tableros.

Nota de vocabulario: en el código y en la API es `Card`/`cards`; en la
interfaz y en los mensajes al usuario es **tarjeta**.

## Modelos (`models.py`)

| Modelo | Tabla | Notas |
|---|---|---|
| `Tablero` | `planificacion_tablero` | `tipo` personal/equipo, `propietario` (solo personal), `equipo` (solo de equipo), `archivado`, `siguiente_numero_card`. `CheckConstraint` de coherencia tipo↔dueño. |
| `Columna` | `planificacion_columna` | `orden`, `es_final` (sus tarjetas cuentan como terminadas), `incluir_en_gantt`, `limite_cards` (límite **suave**, D-13: se avisa, no se bloquea; `null` = sin límite), `archivada`, `version`. |
| `Card` | `planificacion_card` | `numero` correlativo por tablero (único), `titulo`, `descripcion`, `fecha_inicio`, `fecha_fin` (solo día, D-01), `urgencia` (baja/media/alta/critica), `orden`, `en_gantt` (heredar/si/no), `etiquetas` (M2M), `campos` (JSON), `completada_en`, `aviso_vencimiento`, `archivada`, `version`. `CheckConstraint` `fecha_fin ≥ fecha_inicio` + `clean()`. |
| `ResponsableCard` | `planificacion_responsable_card` | Varios por tarjeta; único (card, usuario). |
| `Etiqueta` | `planificacion_etiqueta` | Por tablero (`related_name="etiquetas"`): `nombre` (único en el tablero), `color`, `orden`. `Card.etiquetas` es M2M (`planificacion_card_etiqueta`). Borrar una etiqueta la quita de sus tarjetas. |
| `CampoPersonalizado` | `planificacion_campo_personalizado` | Por tablero (`related_name="campos"`): `tipo` texto/numero/lista, `opciones` (lista), `orden`, `visible_en_tarjeta`, `archivado`. Nombre único entre los activos. No se borran: se archivan. Los valores viven en `Card.campos` (JSON `{"<id del campo>": valor}`, D-14). |
| `Comentario` | `planificacion_comentario` | `menciones` M2M, `editado_en`, `eliminado` (borrado lógico). |
| `ItemChecklist` | `planificacion_item_checklist` | `texto`, `hecho`, `orden`. |
| `Actividad` | `planificacion_actividad` | Historial inmutable: `accion` ∈ creo, movio, edito, asigno, desasigno, comento, checklist, archivo, restauro, traslado, dependencia; `detalle` (antes/después). Etiquetas: `edito` con `campo="etiquetas"` (nombres separados por coma); campos: `campo="personalizado"` con `nombre`, `antes`, `despues` en texto. |

Lecturas reutilizables en QuerySet: `Tablero.objects.activos()`,
`.visibles_para(u)`; `Columna.objects.activas()`; `Card.objects.activas()`,
`.abiertas()`, `.visibles_para(u)`, `.asignadas_a(u)`, `.con_detalle()`,
`.por_fecha_fin()`. Reglas de una instancia en métodos: `Card.clean()`,
`Card.entra_en_gantt()`, `Card.alinear_con_columna()`,
`Tablero.personas_asignables()`.

## Servicios (`services/`)

Cada operación es **una transacción** que deja todo consistente (cambio +
historial + avisos + estado de vencimiento). Argumentos por nombre; lanzan
`core.errores.*`.

| Archivo | Operaciones |
|---|---|
| `tableros.py` | `crear_tablero` (con Tareas / En curso / Hecho, o las `columnas` que se le pasen: así lo usa `plantillas`), `asegurar_tablero_personal` («Mi tablero» en el primer ingreso), `personales_de`, `puede_archivar_personal`, `editar_tablero`, `archivar_tablero` |
| `columnas.py` | `crear_columna`, `reordenar_columnas`, `editar_columna` (con `version`; incluye `limite_cards`), `archivar_columna` (exige destino para sus tarjetas) |
| `tarjetas.py` | `crear_card` (`avisar=False` para la importación y las plantillas; acepta `etiquetas` y `valores_campos`), `editar_card` (con `version` → `ConflictoDeVersion`; `etiquetas` y `valores_campos` registran su historial), `mover_card`, `archivar_card`, `trasladar_card` (emite la señal `tarjeta_trasladada`; conserva las etiquetas y los campos que existan en el destino con el mismo nombre —y tipo, en los campos—; el resto se pierde, no se crea) |
| `etiquetas.py` | `crear_etiqueta` (máx. 30 por tablero; nombre repetido → `ReglaDeNegocio`), `editar_etiqueta`, `eliminar_etiqueta` |
| `campos.py` | `crear_campo` (máx. 20 activos; una lista exige opciones), `editar_campo` (el tipo no cambia), `valor_valido` (número con coma o punto → int/float; lista: una de sus opciones; texto ≤ 500), `validar_valores` (solo campos activos del tablero; `null`/vacío borra), `texto_valor`, `remapear` (valores de un tablero a otro) |
| `comentarios.py` | `extraer_menciones`, `comentar`, `editar_comentario`, `eliminar_comentario` |
| `checklist.py` | `agregar_item`, `editar_item`, `eliminar_item` |
| `actividad.py` | `registrar`, `registrar_ediciones`, `registrar_responsables` |
| `avisos.py` | Qué se avisa, a quién y con qué texto: `avisar_asignacion`, `avisar_menciones`, `avisar_comentario` |
| `vencimientos.py` | `vencimiento()` (derivado, nunca se guarda), `umbral_por_vencer()` (del Portal), `sincronizar()`, `sincronizar_columna()`, `revisar()` (cron diario) |

## Permisos (`permisos.py`)

| Acción | Personal | De equipo |
|---|---|---|
| Ver | solo dueño | miembros y lectores |
| Tarjetas y comentarios (`puede_editar_tablero`) | solo dueño | administradores y miembros (+ admin del módulo) |
| Columnas, nombre, archivar (`puede_gestionar_tablero`) | solo dueño | administradores del equipo |

- El admin del módulo **nunca** ve tableros personales ajenos (D-07).
- Tablero o equipo archivado → solo lectura.
- Un personal solo se archiva si a su dueño le queda otro activo.
- `permisos_tablero()` se serializa para que el frontend **refleje** (no
  decida) qué botones mostrar.

## API (`/api/v1/`)

Vistas delgadas por recurso en `api/views/` (permiso → servicio →
serializer). Piezas comunes en `api/views/comunes.py`: `obtener_tablero`,
`obtener_card` (403 si no puede ver/editar, 404 si no existe), `contexto`,
`detalle_tablero`, `detalle_card`, `conflicto` (409).

| Ruta | Operaciones |
|---|---|
| `tableros/` | listar (personales + de mis equipos; `?archivados=personales`), crear (sin `equipo` = personal) |
| `tableros/<id>/` · `archivar/` · `archivadas/` | ver (con columnas y tarjetas), editar · archivar/restaurar · tarjetas archivadas |
| `equipos/<id>/tableros/` | tableros del equipo |
| `tableros/<id>/columnas/` · `columnas/reordenar/` | crear · reordenar |
| `columnas/<id>/` · `columnas/<id>/archivar/` | editar (con `version`) · archivar con destino |
| `tableros/<id>/etiquetas/` · `etiquetas/<id>/` | crear · renombrar/recolorear, eliminar (gestionar) |
| `tableros/<id>/campos/` · `campos/<id>/` | crear · editar nombre, opciones, visibilidad, archivar (gestionar; cambiar `tipo` → 400) |
| `tableros/<id>/cards/` · `cards/<numero>/` | crear · ver por número (deep link) |
| `cards/<id>/` | ver, editar (PATCH con `version`; `etiquetas` = lista de ids, `campos` = `{id: valor\|null}` y solo cambia los que vienen) |
| `cards/<id>/mover/` · `archivar/` · `trasladar/` · `actividad/` | mover (columna + posición) · archivar/restaurar · llevar a otro tablero · historial |
| `cards/<id>/checklist/` · `checklist/<id>/` | añadir · marcar, renombrar, eliminar |
| `cards/<id>/comentarios/` · `comentarios/<id>/` | listar, crear · editar, borrar |
| `mis-tareas/` | tarjetas donde soy responsable |

## Comando programado

`python manage.py revisar_vencimientos` — una vez al día, temprano.
Idempotente: emite `card_por_vencer` / `card_vencida` **una vez por
transición** (`aviso_vencimiento`) y resuelve los que ya no aplican; al final
procesa la bandeja de avisos.

## Señales

`signals.tarjeta_trasladada(card, origen)`: la escucha `gantt` para borrar
dependencias. `tableros` no conoce a quien escucha: así la dependencia entre
apps va en un solo sentido.

## Dependencias

- Depende de: `core`, `equipos`, `calendario`, `integracion_portal`.
- Lo usan: `gantt`, `exportacion` (modelos, servicios **y**
  `api.views.comunes` / `api.serializers`, ver auditoría A-06), `plantillas`.
- **Nunca** importar `gantt`, `exportacion` ni `plantillas` desde aquí.

## Pruebas

`tests/base.py` → `EscenarioTablero`: equipo «Obra» con tablero «Plan»; ana
administra, beto y carla son miembros, `lector` solo consulta, `ajeno` no está
(ids del Portal fijos 11/22/33 para verificar destinatarios). Archivos por
funcionalidad: `test_tableros`, `test_columnas`, `test_tarjetas`,
`test_comentarios`, `test_checklist`, `test_avisos`, `test_vencimientos`,
`test_mis_tareas`, `test_configuracion` (etiquetas, campos y límite).

## Cuidado al modificar

- Reglas nuevas → modelo (una instancia), QuerySet (lecturas) o servicio
  (efectos); nunca en la vista ni en el serializer (los serializers no
  escriben).
- Toda edición de tarjeta/columna respeta `version`; sube `version` al guardar.
- No borrar físicamente: archivar.
- Cualquier cambio de fechas, columna o archivo debe llamar a
  `vencimientos.sincronizar` (ya lo hacen los servicios de `tarjetas`).
  Reutilizar `editar_card` en vez de escribir la tarjeta a mano (así lo hace
  `gantt.programacion`).
- Avisos: nunca al actor, solo a quien hoy puede ver el tablero, siempre con
  `ruta` a la tarjeta.
- Cambiar la forma de `CardResumen`/`CardDetalle`/`TableroDetalle` exige
  actualizar `frontend/src/api/tipos.ts`.
- Valores de campos: siempre por `campos.validar_valores` (el serializer ya
  lo hace); nunca escribir `Card.campos` a mano. Un campo archivado conserva
  sus valores y deja de aceptarlos.
- Una regla nueva sobre etiquetas o campos que afecte a la exportación o a
  las plantillas debe revisarse también en `exportacion` y `plantillas`.

## Relacionado

[`plan-modulo-planificacion.md`](../plan-modulo-planificacion.md) §4, §5,
§6.3 · [`equipos.md`](equipos.md) · [`gantt.md`](gantt.md) ·
[`frontend.md`](frontend.md).
