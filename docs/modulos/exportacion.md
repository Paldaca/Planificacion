# Módulo `exportacion` (fase 4)

> Leer antes de modificar `backend/exportacion/` o
> `frontend/src/components/tablero/ImportarDialogo.tsx`. Revisado: 2026-09-26.
>
> Estado: implementado (commit `6e9157a`) y auditado (`e81f239`). Falta abrir
> el XML en un MS Project real para cerrar el criterio de aceptación.

## Responsabilidad

Llevar un tablero a las herramientas de la empresa y traerlo de vuelta:

- **Excel (.xlsx)** con openpyxl: hoja *Tarjetas* (una fila por tarjeta, con
  las columnas de importación + columnas informativas que la importación
  ignora) y hoja *Gantt* (días pintados con el color de la urgencia; fines de
  semana y feriados atenuados; más de un año, o más de 120 000 celdas, → una
  columna por semana). La hoja *Tarjetas* abre con un bloque de
  identificación (tablero, fecha, resumen, filtros aplicados). Desde la fase 5
  lleva también la columna *Etiquetas* (nombres separados por coma) y una
  columna por cada campo personalizado activo, todas importables.
- **MS Project**: XML de Project (**MSPDI**). El `.mpp` es cerrado y no se
  genera. Etiquetas y campos personalizados **no** viajan al XML.
- **Gantt en PDF** (`services/pdf.py`, ReportLab): el diagrama para compartir
  o imprimir, con la configuración de la pantalla (ver abajo).
- **Plantilla** de importación: hoja *Tarjetas* vacía con listas desplegables
  (columnas del tablero, urgencias y campos de tipo lista) + columnas
  *Etiquetas* y de campos + hoja de instrucciones. (No confundir con las
  plantillas de tablero de la app `plantillas`.)
- **Importación** desde Excel o MSPDI en dos pasos: vista previa y
  confirmación.

## Servicios

| Archivo | Qué hace |
|---|---|
| `services/datos.py` | Qué se exporta y cómo se nombra, compartido por los tres formatos. `Filtros` = los mismos del tablero en pantalla (`frontend/src/lib/filtros.ts`, incluidas las etiquetas) para exportar exactamente lo que se ve. Dependencias en texto estilo Project en español: `3`, `3CC+2`, `3FF-1`. `Contenido.campos`: campos activos del tablero. |
| `services/excel.py` | `exportar`, `plantilla`, `leer`. Antes de guardar, toda celda que openpyxl tomó por fórmula pasa a texto (`_sin_formulas`): un título que empieza por `=` no se ejecuta en el Excel de quien descarga. `leer` busca la fila de encabezados (título + otro conocido) en las 15 primeras y recorre bajo demanda con tope (`FILAS_MAXIMAS_LEIDAS`). |
| `services/mspdi.py` | `exportar`, `leer`. Proyecto = tablero; tareas resumen = columnas; tareas = tarjetas del Gantt con inicio y fin; tareas **programadas manualmente**; calendario «Planificación» lun–vie 8–12 y 13–17 con feriados como excepciones; vínculos FC=1, CC=3, FF=0 con desfase; responsables → recursos; urgencia ↔ prioridad (baja 300, media 500, alta 700, crítica 900); avance = checklist; descripción → notas. Elementos en el orden del esquema MSPDI; sin caracteres de control. `leer` rechaza XML con `DOCTYPE`/`ENTITY`. |
| `services/pdf.py` | `exportar(contenido, OpcionesPdf)` y `planificar` (páginas antes de dibujar, para «hoja x de y»). Opciones (`OpcionesPdf.desde_query`): `escala` ajustar\|zoom, `zoom` dia\|semana\|mes (14 / 5,5 / 1,8 pt por día), `agrupar`, `plegado` (claves de grupo, repetible), `desde`/`hasta` (las dos o ninguna; solo tareas que tocan el periodo, recortadas en los bordes) y `hoja` carta\|tabloide (11×17), siempre horizontal. Filas y flechas son **espejo** de `frontend/src/lib/gantt.ts` (`grupoDe`, `construirFilas`, `rutaFlecha`). Con zoom, un plan largo se reparte en tramos de hojas; muchas filas siguen en más hojas repitiendo la escala. Flechas solo si las dos puntas caen en la hoja (debajo de barras y títulos). Más de 150 hojas → `ReglaDeNegocio`. Texto en las fuentes base del PDF (Windows-1252): lo que no cabe en ella sale como «?». |
| `services/modelo.py` | `FilaEntrada`: una fila leída antes de validar (incluye `etiquetas` y `campos` por nombre de encabezado). |
| `services/importacion.py` | `vista_previa` (valida sin tocar la BD: errores y avisos por fila) e `importar` (revalida y crea en **una** transacción las filas válidas y sus dependencias). Límites: 5 MB y 1000 filas. Los responsables reciben **un** aviso agrupado en vez de uno por tarjeta (`crear_card(avisar=False)`). Valores de campo inválidos se ignoran **con aviso** (no son error); las columnas del Excel que no son campos del tablero se ignoran sin más. **Columnas y etiquetas que el tablero no tiene** no dan un aviso por fila: `faltantes` las resume una vez (sin repetir, grafía de su primera aparición) en `vista_previa`. Con `Crear` (casillas del diálogo; solo quien **gestiona** el tablero, `puede_crear`), la vista previa las marca como nuevas y `importar` las crea en la **misma transacción** que las tarjetas (`_crear_faltantes`): columnas antes de la columna final, **dentro del Gantt y no finales** (no se adivina por el nombre: «Pendientes» se saca del Gantt a mano) y etiquetas con colores de `COLORES_ETIQUETA` (primero los no usados). Pasar el cupo de 30 etiquetas es un `problemas` en la vista previa y un 400 al importar, sin crear nada. Sin crearlas: las tarjetas van a la primera columna y sin esas etiquetas. |

No se guarda nada entre vista previa y confirmación: el navegador reenvía el
archivo.

## API (`/api/v1/`)

| Ruta | Operaciones |
|---|---|
| `tableros/<id>/exportar/?formato=xlsx\|xml\|pdf` (+ `q`, `urgencia`, `responsable`, `etiqueta`, `vencidas`; el PDF además `escala`, `zoom`, `agrupar`, `plegado`, `desde`, `hasta`, `hoja`) | descarga (requiere ver el tablero). El PDF se llama `gantt-<tablero>-<fecha>.pdf` |
| `tableros/<id>/importar/plantilla/` | descarga la plantilla |
| `tableros/<id>/importar/` (multipart `archivo`, `confirmar`, `crear_columnas`, `crear_etiquetas`) | sin `confirmar`: vista previa (con `faltantes`, `puede_crear`, `problemas`) · con `confirmar=true`: crea y devuelve `columnas_creadas` / `etiquetas_creadas` (requiere editar; `crear_*` requiere gestionar, si no 403) |

## Dependencias

- Depende de: `core`, `calendario`, `gantt`, `integracion_portal`,
  `tableros` (incluido `api.views.comunes.obtener_tablero`, ver auditoría A-06).
- No lo usa ninguna otra app (es la capa superior).

## Pruebas

`tests/test_exportacion.py` (incluye la ida y vuelta y `EtiquetasYCamposTests`) y
`tests/test_importar_faltantes.py` (resumen, crear columnas y etiquetas, permisos,
cupo sin crear nada) y `tests/test_pdf.py` (hojas, filas como la pantalla, plegados, filtros, periodo,
tramos, límite de hojas, permisos). Criterios de aceptación
de la fase 4: un tablero exportado a XML e importado de nuevo conserva
tarjetas, fechas y dependencias; el XML abre en MS Project sin advertencias
(pendiente de probar con Project).

## Cuidado al modificar

- Mantener simétricos exportar y leer: lo que se exporta debe poder
  reimportarse (prueba de ida y vuelta).
- Los filtros deben coincidir con `frontend/src/lib/filtros.ts`.
- Crear tarjetas siempre con `tableros.services.tarjetas.crear_card` y
  dependencias con `gantt.services.dependencias.crear_dependencia`.
- La generación es síncrona dentro de la petición; el plan prevé descarga
  diferida para archivos grandes (pendiente).
- XML parseado con `xml.etree.ElementTree`; se rechazan `DOCTYPE` y `ENTITY`
  antes de parsear (auditoría A-13).
- Nunca escribir fórmulas en los Excel: `_guardar` las convierte en texto.
- PDF: si cambia cómo agrupa u ordena el Gantt de la pantalla (`lib/gantt.ts`),
  cambiar igual `pdf.construir_filas` / `pdf._grupo` / `pdf._ruta`, y los
  colores si cambian los de `lib/estilos.ts`.

## Relacionado

[`plan-modulo-planificacion.md`](../plan-modulo-planificacion.md) §7 Fase 4 ·
[`gantt.md`](gantt.md) · [`tableros.md`](tableros.md).
