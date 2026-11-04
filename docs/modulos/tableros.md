# Módulo `tableros`

> Leer antes de modificar `backend/tableros/`. Revisado: 2026-11-04.
>
> Es el núcleo del dominio: casi todo cambio funcional pasa por aquí.

## Responsabilidad

Tableros, columnas (con límite de tarjetas), tarjetas (*cards*),
responsables, etiquetas (con etiquetas de hito), campos personalizados,
adjuntos, comentarios con menciones, checklist, historial (actividad), vencimientos y avisos de colaboración, *Mis
tareas*, traslado de tarjetas entre tableros y **tarjetas recurrentes** (recordatorios que se crean solos cada
semana o cada mes).

Nota de vocabulario: en el código y en la API es `Card`/`cards`; en la
interfaz y en los mensajes al usuario es **tarjeta**.

## Modelos (`models.py`)

| Modelo | Tabla | Notas |
|---|---|---|
| `Tablero` | `planificacion_tablero` | `ayuda` (JSON: guía propia del Centro de ayuda que trae su plantilla; `{}` en la mayoría), `tipo` personal/equipo, `propietario` (solo personal), `equipo` (solo de equipo), `archivado`, `siguiente_numero_card`. `CheckConstraint` de coherencia tipo↔dueño. |
| `Columna` | `planificacion_columna` | `orden`, `es_final` (sus tarjetas cuentan como terminadas), `incluir_en_gantt`, `limite_cards` (límite **suave**, D-13: se avisa, no se bloquea; `null` = sin límite), `archivada`, `version`. |
| `Card` | `planificacion_card` | `numero` correlativo por tablero (único), `titulo`, `descripcion`, `fecha_inicio`, `fecha_fin` (solo día, D-01), `urgencia` (baja/media/alta/critica), `orden`, `en_gantt` (heredar/si/no), `etiquetas` (M2M), `campos` (JSON), `completada_en`, `aviso_vencimiento`, `archivada`, `recurrencia` (FK a su serie, o null) y `ocurrencia` (su fecha de vencimiento en la serie), `version`. `CheckConstraint` `fecha_fin ≥ fecha_inicio` + `clean()`; `UniqueConstraint` (recurrencia, ocurrencia): una tarjeta por fecha de la serie. |
| `ResponsableCard` | `planificacion_responsable_card` | Varios por tarjeta; único (card, usuario). |
| `Etiqueta` | `planificacion_etiqueta` | Por tablero (`related_name="etiquetas"`): `nombre` (único en el tablero sin distinguir mayúsculas ni acentos: `core.texto.clave_nombre`), `color`, `orden`, `es_hito` (las tarjetas que la llevan son **hitos**: `Card.es_hito`, un rombo en el Gantt y su PDF y `Milestone` en MS Project; se marca a mano, nunca por el nombre). `Card.etiquetas` es M2M (`planificacion_card_etiqueta`). Borrar una etiqueta la quita de sus tarjetas. |
| `CampoPersonalizado` | `planificacion_campo_personalizado` | Por tablero (`related_name="campos"`): `tipo` texto/numero/lista, `opciones` (lista), `orden`, `visible_en_tarjeta`, `atajo_al_crear` (solo listas, por defecto no: aparece como atajo en «Nueva tarea» y la tarea creada después de otra toma su valor; lo decide cada tablero o su plantilla), `archivado`. Nombre único entre los activos (sin mayúsculas ni acentos): lo cumple `campos._guardar` con el tablero bloqueado, porque MySQL no crea la restricción con condición `campo_activo_unico_por_tablero`. No se borran: se archivan. Los valores viven en `Card.campos` (JSON `{"<id del campo>": valor}`, D-14). |
| `Adjunto` | `planificacion_adjunto` | Archivo de una tarjeta: `nombre`, `tipo` (MIME deducido del nombre; una imagen cuyo contenido no lo es queda como `application/octet-stream`), `tamano`, `contenido` (**en la base**, `BinaryField`: decisión D-16; una imagen, ya reducida a 1920 px), `miniatura` (JPEG de 480 px de una imagen, o null), `huella` (SHA-256 de lo que se subió, para no duplicar), `subido_por`. Listar siempre con `Adjunto.objects.sin_contenido()` (no trae `contenido` ni `miniatura`). |
| `Comentario` | `planificacion_comentario` | `menciones` M2M, `editado_en`, `eliminado` (borrado lógico). |
| `ItemChecklist` | `planificacion_item_checklist` | `texto`, `hecho`, `orden`. |
| `TableroFavorito` | `planificacion_tablero_favorito` | `usuario`, `tablero`, `creado_en`; único (usuario, tablero). Solo lo ve esa persona y **no da acceso**: los listados parten de `visibles_para`, así que un favorito de un tablero que ya no ve no aparece. |
| `Recurrencia` | `planificacion_recurrencia` | Serie de tarjetas recurrentes de un tablero: `modelo` (JSON con lo que copia cada tarjeta: título sin periodo, descripción, columna, urgencia, `en_gantt`, ids de responsables y etiquetas, campos, textos del checklist), `frecuencia` semanal/mensual, `intervalo` (1–12), `dia` (semanal 0 = lunes … 6; mensual 1–31, el 31 es el último día del mes), `anticipacion` (días hábiles antes de vencer en que se crea, 0–30), `proxima` (fecha de la serie **sin ajustar** a día hábil), `activa`, `creada_por`. Las tarjetas de la serie: `Card.recurrencia` (`SET_NULL`: quitar la serie deja las tarjetas). |
| `Actividad` | `planificacion_actividad` | Historial inmutable: `accion` ∈ creo, movio, edito, asigno, desasigno, comento, checklist, archivo, restauro, traslado, dependencia, adjunto (`cambio` agrego/quito y `nombre`); `detalle` (antes/después). Etiquetas: `edito` con `campo="etiquetas"` (nombres separados por coma); campos: `campo="personalizado"` con `nombre`, `antes`, `despues` en texto. |

Lecturas reutilizables en QuerySet: `Tablero.objects.activos()`,
`.visibles_para(u)`; `Columna.objects.activas()`; `Card.objects.activas()`,
`.abiertas()`, `.visibles_para(u)`, `.asignadas_a(u)`, `.con_detalle()`,
`.por_fecha_fin()` (`con_detalle` cuenta comentarios, ítems y adjuntos con
subconsultas, no con JOIN + COUNT DISTINCT, que multiplicaba filas, y trae
`id_portada`: la primera imagen adjunta, de `TIPOS_IMAGEN`). Reglas de
una instancia en métodos: `Card.clean()`,
`Card.entra_en_gantt` (propiedad), `Card.alinear_con_columna()`,
`Tablero.personas_asignables()`.

## Servicios (`services/`)

Cada operación es **una transacción** que deja todo consistente (cambio +
historial + avisos + estado de vencimiento). Argumentos por nombre; lanzan
`core.errores.*`.

| Archivo | Operaciones |
|---|---|
| `tableros.py` | `crear_tablero` (con Tareas / En curso / Hecho, o las `columnas` que se le pasen, y la `ayuda` de la plantilla: así lo usa `plantillas`), `limpiar_ayuda` (la guía, solo como texto y con límites; lo que no tiene la forma esperada se descarta), `asegurar_tablero_personal` («Mi tablero» en el primer ingreso), `personales_de`, `puede_archivar_personal`, `editar_tablero`, `archivar_tablero` |
| `columnas.py` | `crear_columna`, `reordenar_columnas`, `editar_columna` (con `version`; incluye `limite_cards`), `archivar_columna` (exige destino para sus tarjetas) |
| `tarjetas.py` | `crear_card` (`avisar=False` para la importación y las plantillas; acepta `etiquetas` y `valores_campos`), `editar_card` (con `version` → `ConflictoDeVersion`; `etiquetas` y `valores_campos` registran su historial; `avisar=False` sin aviso de asignación), `asignar_en_lote` (atajo: hace a una persona responsable de todas las tarjetas **abiertas** de una etiqueta o con una opción de un campo de lista —una fase—; `reemplazar` la deja sola; cada tarjeta pasa por `editar_card` y la persona recibe **un** aviso agrupado; es de una vez, no una regla para las tarjetas futuras), `mover_card`, `archivar_card`, `trasladar_card` (emite la señal `tarjeta_trasladada`; conserva las etiquetas y los campos que existan en el destino con el mismo nombre —y tipo, en los campos—; el resto se pierde, no se crea) |
| `favoritos.py` | `marcar_favorito` (idempotente; quien llama ya comprobó que lo ve), `ids_favoritos` |
| `etiquetas.py` | `crear_etiqueta` (máx. 30 por tablero; nombre repetido → `ReglaDeNegocio`; `es_hito`), `editar_etiqueta` (nombre, color, `es_hito`), `eliminar_etiqueta` |
| `adjuntos.py` | `adjuntar` (hasta `MAX_BYTES` = 10 MB y `MAX_POR_TARJETA` = 20; nombre sin carpetas; rechaza vacíos, `EXTENSIONES_BLOQUEADAS` (programas y scripts) y un archivo que ya está adjunto a la tarjeta: misma `huella`; las imágenes pasan por `_preparar_imagen`: se reducen a `LADO_MAXIMO` = 1920 px en su formato (solo si así pesan menos; un GIF queda tal cual), se genera la miniatura y se rechazan las de más de `MAX_PIXELES`; la que Pillow no lee se guarda sin tocar y sin miniatura), `comprobar_peticion` (la vista la llama con el `Content-Length` **antes** de leer el cuerpo: una subida que ya anuncia más del límite no llega a escribirse en el disco temporal), `es_imagen` / `se_puede_mostrar` (PNG, JPEG, GIF y WebP, comprobando el comienzo del contenido: lo único que se sirve en línea; **sin SVG**), `quitar` (borra de verdad, para liberar el espacio; ambos quedan en el historial) |
| `campos.py` | `crear_campo` (máx. 20 activos; una lista exige opciones), `editar_campo` (el tipo no cambia; `renombrar={vieja: nueva}` en una lista cambia también el valor de las tarjetas que tenían esa opción, sin historial por tarjeta, como borrar una etiqueta; quitar una opción no toca las tarjetas), `valor_valido` (número con coma o punto → int/float; lista: una de sus opciones; texto ≤ 500), `validar_valores` (solo campos activos del tablero; `null`/vacío borra), `texto_valor`, `remapear` (valores de un tablero a otro) |
| `comentarios.py` | `extraer_menciones`, `comentar`, `editar_comentario`, `eliminar_comentario` |
| `checklist.py` | `agregar_item`, `editar_item`, `eliminar_item` |
| `actividad.py` | `registrar`, `registrar_ediciones`, `registrar_responsables` |
| `avisos.py` | Qué se avisa, a quién y con qué texto: `avisar_asignacion`, `avisar_asignacion_en_lote` (uno por persona: «Te asignaron N tarjetas»), `avisar_recurrente` («Recordatorio: …» a **todos** los responsables, también a quien armó la serie: la crea el sistema), `avisar_menciones`, `avisar_comentario` |
| `recurrencias.py` | `crear_recurrencia` (desde una tarjeta: pasa a ser la primera de la serie y su foto es el modelo; la siguiente vence después de su fecha final o de hoy), `editar_recurrencia` (calendario, `activa` y `modelo_desde` = otra tarjeta de la serie; si cambia el calendario, la próxima se recalcula desde la última creada), `eliminar_recurrencia`, `generar(hoy)` (crea las que ya tocan: vence el día de la serie o el hábil anterior, se crea `anticipacion` días hábiles antes, en la columna del modelo —o la primera no final—, con el periodo en el título, «Respaldo · noviembre 2026» o «… · semana del 09/11»; responsables, etiquetas y campos que ya no valen se omiten; bloquea la serie y respeta la restricción única, así que es idempotente; si el comando no corrió, se pone al día con tope de `MAX_POR_CORRIDA` = 12 por serie), y las fechas (`primera`, `vence`, `se_crea`, `periodo`, `describir`). Si la anterior sigue abierta, la nueva se crea igual: cada periodo es su obligación |
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
| `tableros/<id>/` · `archivar/` · `archivadas/` | ver (con columnas, tarjetas y `ayuda`: la guía propia o null), editar · archivar/restaurar · tarjetas archivadas |
| `tableros/<id>/favorito/` | POST marcar, DELETE quitar (basta con **ver** el tablero; responde `{es_favorito}`). Los tableros traen `es_favorito` (una consulta por respuesta, no por tablero) |
| `equipos/<id>/tableros/` | tableros del equipo |
| `tableros/<id>/columnas/` · `columnas/reordenar/` | crear · reordenar |
| `columnas/<id>/` · `columnas/<id>/archivar/` | editar (con `version`) · archivar con destino |
| `tableros/<id>/etiquetas/` · `etiquetas/<id>/` | crear · renombrar/recolorear, marcar `es_hito`, eliminar (gestionar) |
| `tableros/<id>/asignar-en-lote/` | POST `{usuario, etiqueta}` o `{usuario, campo, opcion}` y `reemplazar` → `{tarjetas, cambiadas}` (gestionar; la persona debe poder ser responsable) |
| `tableros/<id>/campos/` · `campos/<id>/` | crear · editar nombre, opciones (con `renombrar: {vieja: nueva}` para que las tarjetas sigan a la opción renombrada), visibilidad, archivar (gestionar; cambiar `tipo` → 400) |
| `tableros/<id>/cards/` · `cards/<numero>/` | crear · ver por número (deep link) |
| `cards/<id>/` | ver, editar (PATCH con `version`; `etiquetas` = lista de ids, `campos` = `{id: valor\|null}` y solo cambia los que vienen). Toda tarjeta trae `num_adjuntos` y `portada` (id de la primera imagen adjunta o null) |
| `cards/<id>/mover/` · `archivar/` · `trasladar/` · `actividad/` | mover (columna + posición) · archivar/restaurar · llevar a otro tablero · historial |
| `cards/<id>/adjuntos/` · `adjuntos/<id>/` | listar (ver), subir multipart `archivo` (editar) · descargar (ver; `attachment` + `nosniff`) o, con `?ver=1` y solo si es una imagen comprobada, mostrar en línea (`inline` + `nosniff` + CSP `sandbox`, caché privada de una hora); `?ver=miniatura`, la miniatura (o la imagen, si no tiene), quitar (editar). La tarjeta abierta ya trae `adjuntos` (sin contenido, con `es_imagen`) |
| `cards/<id>/checklist/` · `checklist/<id>/` | añadir · marcar, renombrar, eliminar |
| `cards/<id>/comentarios/` · `comentarios/<id>/` | listar, crear · editar, borrar |
| `tableros/<id>/recurrencias/` | listar las series (ver el tablero), con `descripcion`, `vence`, `se_crea` y `tarjetas` |
| `cards/<id>/recurrencia/` | POST `{frecuencia, dia, intervalo?, anticipacion?}`: la tarjeta empieza a repetirse (gestionar; 400 si ya se repite o está archivada) |
| `recurrencias/<id>/` | PATCH calendario, `activa`, `modelo_desde` (id de una tarjeta de la serie) · DELETE (gestionar). Toda tarjeta trae `recurrencia` (id o null) |
| `mis-tareas/` | tarjetas donde soy responsable |

## Comando programado

`python manage.py revisar_vencimientos` — una vez al día, temprano.
**Primero crea las tarjetas recurrentes del día** (`recurrencias.generar`), así
las nuevas entran en la misma revisión. Idempotente: emite `card_por_vencer` / `card_vencida` **una vez por
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
`test_mis_tareas`, `test_configuracion` (etiquetas, etiqueta de hito, campos y límite),
`test_favoritos`, `test_recurrencias` (fechas: último día del mes, día no hábil, semanal y cada tantos; la serie desde una tarjeta, una sola tarjeta por fecha, aviso a todos, ponerse al día con tope, no nacer en «Hecho», pausa y tablero archivado, cambiar calendario y modelo, quitar, trasladar y permisos), `test_asignar_en_lote` (por etiqueta y por fase, reemplazar, repetirlo, aviso único, validaciones y permisos), `test_adjuntos` (subir, listar, descargar, imágenes en línea y falsas
imágenes, sin duplicados, quitar, límites y permisos).

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
- Adjuntos: nunca `card.adjuntos.all()` para listar (trae los archivos):
  `sin_contenido()`. Se sirven como descarga; en línea solo las imágenes de
  `FIRMAS_IMAGEN`, comprobadas al subir y al servir. No ampliar esa lista a
  SVG, HTML ni PDF: se ejecutarían en el origen de la aplicación. «Nada se borra» no aplica a los adjuntos: quitar uno lo
  borra (queda el historial). No viajan en plantillas ni exportaciones.
- Tarjetas recurrentes: la tarjeta se crea con `crear_card` (`avisar=False`, el aviso es `avisar_recurrente`); trasladar una tarjeta la saca de su serie (las series no cruzan tableros). Las plantillas y la exportación **no** llevan las series.
- Hito: depende solo de `Etiqueta.es_hito`. No deducirlo del nombre de la
  etiqueta ni de que la tarjeta dure un día.
- Una regla nueva sobre etiquetas o campos que afecte a la exportación o a
  las plantillas debe revisarse también en `exportacion` y `plantillas`.

## Relacionado

[`plan-modulo-planificacion.md`](../plan-modulo-planificacion.md) §4, §5,
§6.3 · [`equipos.md`](equipos.md) · [`gantt.md`](gantt.md) ·
[`frontend.md`](frontend.md).
