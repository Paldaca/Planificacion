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
  identificación (tablero, fecha, resumen, filtros aplicados).
- **MS Project**: XML de Project (**MSPDI**). El `.mpp` es cerrado y no se
  genera.
- **Plantilla** de importación: hoja *Tarjetas* vacía con listas desplegables
  (columnas del tablero, urgencias) + hoja de instrucciones.
- **Importación** desde Excel o MSPDI en dos pasos: vista previa y
  confirmación.

## Servicios

| Archivo | Qué hace |
|---|---|
| `services/datos.py` | Qué se exporta y cómo se nombra, compartido por los tres formatos. `Filtros` = los mismos del tablero en pantalla (`frontend/src/lib/filtros.ts`) para exportar exactamente lo que se ve. Dependencias en texto estilo Project en español: `3`, `3CC+2`, `3FF-1`. |
| `services/excel.py` | `exportar`, `plantilla`, `leer`. Antes de guardar, toda celda que openpyxl tomó por fórmula pasa a texto (`_sin_formulas`): un título que empieza por `=` no se ejecuta en el Excel de quien descarga. `leer` busca la fila de encabezados (título + otro conocido) en las 15 primeras y recorre bajo demanda con tope (`FILAS_MAXIMAS_LEIDAS`). |
| `services/mspdi.py` | `exportar`, `leer`. Proyecto = tablero; tareas resumen = columnas; tareas = tarjetas del Gantt con inicio y fin; tareas **programadas manualmente**; calendario «Planificación» lun–vie 8–12 y 13–17 con feriados como excepciones; vínculos FC=1, CC=3, FF=0 con desfase; responsables → recursos; urgencia ↔ prioridad (baja 300, media 500, alta 700, crítica 900); avance = checklist; descripción → notas. Elementos en el orden del esquema MSPDI; sin caracteres de control. `leer` rechaza XML con `DOCTYPE`/`ENTITY`. |
| `services/modelo.py` | `FilaEntrada`: una fila leída antes de validar. |
| `services/importacion.py` | `vista_previa` (valida sin tocar la BD: errores y avisos por fila) e `importar` (revalida y crea en **una** transacción las filas válidas y sus dependencias). Límites: 5 MB y 1000 filas. Los responsables reciben **un** aviso agrupado en vez de uno por tarjeta (`crear_card(avisar=False)`). |

No se guarda nada entre vista previa y confirmación: el navegador reenvía el
archivo.

## API (`/api/v1/`)

| Ruta | Operaciones |
|---|---|
| `tableros/<id>/exportar/?formato=xlsx\|xml` (+ `q`, `urgencia`, `responsable`, `vencidas`) | descarga (requiere ver el tablero) |
| `tableros/<id>/importar/plantilla/` | descarga la plantilla |
| `tableros/<id>/importar/` (multipart `archivo`, `confirmar`) | sin `confirmar`: vista previa · con `confirmar=true`: crea (requiere editar) |

## Dependencias

- Depende de: `core`, `calendario`, `gantt`, `integracion_portal`,
  `tableros` (incluido `api.views.comunes.obtener_tablero`, ver auditoría A-06).
- No lo usa ninguna otra app (es la capa superior).

## Pruebas

`tests/test_exportacion.py` (incluye la ida y vuelta). Criterios de aceptación
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

## Relacionado

[`plan-modulo-planificacion.md`](../plan-modulo-planificacion.md) §7 Fase 4 ·
[`gantt.md`](gantt.md) · [`tableros.md`](tableros.md).
