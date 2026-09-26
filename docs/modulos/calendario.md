# Módulo `calendario` (calendario laboral)

> Leer antes de modificar `backend/calendario/`. Revisado: 2026-09-25.

## Responsabilidad

**Punto único de verdad de los días hábiles**: lunes a viernes que no son
feriado. Lo usan vencimientos, Gantt (dependencias y reprogramación) y
exportaciones.

## Modelo

`Feriado` (`planificacion_feriado`): `fecha`, `nombre`, `recurrente`.

- `recurrente=True`: se repite cada año (se guarda con el año 2000; solo
  cuentan día y mes).
- `recurrente=False`: fecha puntual (p. ej. un puente decretado).
- Los **móviles** (Carnaval, Jueves y Viernes Santo) **no se guardan**: se
  calculan desde la Pascua (`pascua()`, `feriados_moviles()`).
- Nacionales sembrados por la migración `0002_feriados_nacionales`.

## Servicios

`services/dias_habiles.py`: `feriados_del_anio`, `feriados_entre`, `es_habil`,
`dias_habiles_hasta`, `duracion_habil`, `siguiente_habil`, `sumar_habiles`,
`fin_desde_inicio`, `invalidar_cache`.

`services/feriados.py`: `crear_feriado`, `eliminar_feriado`.

Caché: los feriados de cada año se guardan 5 min en `django.core.cache` con
una clave versionada; `signals.py` invalida (sube la versión) en cualquier
`post_save`/`post_delete` de `Feriado`, incluido el admin de Django. Es la
única señal de negocio del proyecto, justificada porque los feriados se editan
por dos caminos (API y admin).

## API (`/api/v1/`)

| Ruta | Quién |
|---|---|
| `calendario/feriados/?desde=&hasta=` | cualquier usuario del módulo (fijos, puntuales y móviles del rango) |
| `calendario/feriados/` POST · `calendario/feriados/<id>/` DELETE | solo administrador del módulo (`core.roles.es_admin_modulo`) |

## Dependencias

- Depende de: `core`.
- Lo usan: `tableros` (vencimientos), `gantt`, `exportacion`.

## Pruebas

`tests/test_dias_habiles.py` (Pascua, móviles, suma/duración hábil, caché).

## Cuidado al modificar

- Todo cálculo de días hábiles debe pasar por este módulo; no reimplementarlo
  en otra app. (El frontend tiene un espejo simplificado **sin feriados** solo
  para dibujar y para actualizaciones optimistas.)
- La caché es por proceso si no hay `CACHES` compartida (auditoría A-04).
- El calendario es de toda la instalación, no por equipo.

## Relacionado

[`gantt.md`](gantt.md) · [`tableros.md`](tableros.md) §Vencimientos.
