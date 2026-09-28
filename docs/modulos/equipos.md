# Módulo `equipos`

> Leer antes de modificar `backend/equipos/`. Revisado: 2026-09-28.

## Responsabilidad

Equipos creados dentro de Planificación (no existen en el Portal), sus
membresías con rol y las **invitaciones**, única forma de entrar a un equipo.

## Modelos

| Modelo | Tabla | Notas |
|---|---|---|
| `Equipo` | `planificacion_equipo` | `nombre`, `descripcion`, `color` (hex, por defecto `#32407b`), `creado_por`, `archivado`. QuerySet propio (`EquipoQuerySet`). |
| `MiembroEquipo` | `planificacion_miembro_equipo` | `equipo`, `usuario`, `rol` (`RolEquipo`: administrador / miembro / lector), `agregado_por`. Único por (equipo, usuario). `puede_editar` = administrador o miembro. |
| `InvitacionEquipo` | `planificacion_invitacion_equipo` | `equipo`, `invitado`, `invitado_por`, `rol`, `mensaje`, `estado` (pendiente / aceptada / rechazada / cancelada), `respondida_en`. Una sola **pendiente** por (equipo, invitado); las respondidas quedan como historial. La restricción `invitacion_pendiente_unica` tiene condición y MySQL no la crea: la regla la cumple `invitar` con el equipo bloqueado. |

## Servicios

- `services/equipos.py`: `crear_equipo` (quien crea queda administrador),
  `editar_equipo`, `archivar_equipo`, `cambiar_rol`, `quitar_miembro`,
  `salir_del_equipo`. **Regla central: un equipo nunca queda sin
  administrador.**
- `services/invitaciones.py`: `invitar` (bloquea el equipo y rechaza una
  segunda pendiente para la misma persona), `cancelar`, `responder`. Invitar emite
  `planificacion.invitacion_equipo`; responder o cancelar la resuelve, y quien
  invitó recibe `planificacion.invitacion_respondida`.
- `services/candidatos.py`: `buscar_candidatos` (Portal primero; si no
  responde, cuentas espejo locales con `fuente="local"`),
  `resolver_invitado` (confirma con el Portal y crea la cuenta espejo si hace
  falta), `ocupados_en` (miembros e invitados pendientes, para excluirlos).

## Permisos (`permisos.py`)

- `membresia(usuario, equipo)`, `puede_ver_equipo`, `puede_administrar_equipo`.
- El **administrador del módulo** (Portal) ve y administra todos los equipos
  (soporte, equipos huérfanos).
- Invitan solo administradores del equipo; responde solo la persona invitada;
  salir es libre salvo para el último administrador.

## API (`/api/v1/`)

| Ruta | Vista |
|---|---|
| `equipos/` | listar los míos · crear |
| `equipos/<id>/` · `archivar/` | ver, editar · archivar/restaurar |
| `equipos/<id>/miembros/` · `miembros/<miembro_id>/` | listar · cambiar rol, quitar |
| `equipos/<id>/salir/` | salir |
| `equipos/<id>/invitaciones/` | pendientes del equipo · invitar |
| `invitaciones/` | mis invitaciones pendientes |
| `invitaciones/<id>/aceptar/` · `rechazar/` · `cancelar/` | responder · cancelar |
| `personas/?q=` | buscador de candidatos |

`equipos/<id>/tableros/` lo sirve la app `tableros` (así `equipos` no depende
de `tableros`). `api/acceso.py::obtener_equipo` se comparte con esa API.

## Dependencias

- Depende de: `core`, `integracion_portal`, `paldaca_sso` (solo
  `candidatos.py`, ver auditoría A-07).
- Lo usan: `tableros` (permisos, modelos, `obtener_equipo`).
- **Nunca** importar `tableros` desde aquí.

## Pruebas

`tests/base.py` (escenario) · `test_equipos.py` · `test_invitaciones.py`.

## Cuidado al modificar

- Cualquier operación que cambie roles o quite miembros debe preservar «al
  menos un administrador» (con prueba).
- Nadie aparece en un equipo sin haber aceptado: no crear `MiembroEquipo`
  fuera de `crear_equipo` y `responder(aceptar=True)`.
- Invitar a quien nunca entró: la cuenta espejo se crea solo con datos
  confirmados por el Portal (`integracion_portal.services.directorio`).

## Relacionado

[`plan-modulo-planificacion.md`](../plan-modulo-planificacion.md) §5 y §6.2 ·
[`tableros.md`](tableros.md) · [`integracion_portal.md`](integracion_portal.md).
