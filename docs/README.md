# Documentación de Planificación

| Documento | Para qué |
|---|---|
| [`AI_CONTEXT.md`](AI_CONTEXT.md) | Punto de entrada: qué es el programa, stack, mapa del repo, reglas de oro, comandos. Lo leen los asistentes de IA al empezar. |
| [`arquitectura.md`](arquitectura.md) | Arquitectura tal como está construida: capas, dependencias entre apps, flujos, configuración y despliegue. |
| [`auditoria-arquitectura.md`](auditoria-arquitectura.md) | Auditoría de septiembre 2026: fortalezas, hallazgos con severidad, plan de acción y checklist de despliegue. |
| [`modulos/`](modulos/) | Un documento por módulo. **Leer el del módulo antes de modificarlo.** |
| [`plan-modulo-planificacion.md`](plan-modulo-planificacion.md) | Diseño funcional, modelo de datos conceptual, permisos, sincronización con el Portal, plan por fases y decisiones. |
| [`guia-integracion-programas-satelite.md`](guia-integracion-programas-satelite.md) | Guía de la Suite para integrar satélites con el Portal (SSO, avisos). |

## Documentos por módulo

| Módulo | Documento |
|---|---|
| `backend/core` | [`modulos/core.md`](modulos/core.md) |
| `backend/paldaca_sso` | [`modulos/paldaca_sso.md`](modulos/paldaca_sso.md) |
| `backend/integracion_portal` | [`modulos/integracion_portal.md`](modulos/integracion_portal.md) |
| `backend/equipos` | [`modulos/equipos.md`](modulos/equipos.md) |
| `backend/calendario` | [`modulos/calendario.md`](modulos/calendario.md) |
| `backend/tableros` | [`modulos/tableros.md`](modulos/tableros.md) |
| `backend/gantt` | [`modulos/gantt.md`](modulos/gantt.md) |
| `backend/exportacion` | [`modulos/exportacion.md`](modulos/exportacion.md) |
| `backend/plantillas` | [`modulos/plantillas.md`](modulos/plantillas.md) |
| `frontend` | [`modulos/frontend.md`](modulos/frontend.md) |

## Mantenimiento

- Un cambio que altere responsabilidades, modelos, API, reglas o
  dependencias de un módulo actualiza su documento **en el mismo commit**.
- Una app nueva trae su `docs/modulos/<app>.md` (misma estructura:
  responsabilidad, modelos, servicios, API, dependencias, pruebas, cuidado al
  modificar) y su fila en esta tabla, en `AI_CONTEXT.md` §6 y en las reglas
  (`.claude/rules/documentacion.md`, `.cursor/rules/documentacion.mdc`).
- Al cerrar una fase, actualizar el estado en `plan-modulo-planificacion.md` §7
  y en `AI_CONTEXT.md` §8.
