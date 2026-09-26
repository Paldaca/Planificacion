# Regla: leer la documentación antes de modificar un módulo

> Gemela de `.cursor/rules/documentacion.mdc`: si cambias una, cambia la otra.

**Antes de editar cualquier archivo de un módulo, lee su documento** (con la
herramienta de lectura, en esta sesión). Es obligatorio, también para cambios
pequeños: los documentos recogen invariantes que no se ven en el archivo que
estás editando.

| Si vas a tocar… | Lee primero |
|---|---|
| `backend/core/` | `docs/modulos/core.md` |
| `backend/paldaca_sso/` | `docs/modulos/paldaca_sso.md` (kit compartido: no se modifica sin pedido explícito) |
| `backend/integracion_portal/` | `docs/modulos/integracion_portal.md` |
| `backend/equipos/` | `docs/modulos/equipos.md` |
| `backend/calendario/` | `docs/modulos/calendario.md` |
| `backend/tableros/` | `docs/modulos/tableros.md` |
| `backend/gantt/`, `frontend/src/components/gantt/`, `frontend/src/lib/gantt.ts` | `docs/modulos/gantt.md` |
| `backend/exportacion/`, `frontend/src/components/tablero/ImportarDialogo.tsx` | `docs/modulos/exportacion.md` |
| `backend/plantillas/`, `frontend/src/components/plantillas/` | `docs/modulos/plantillas.md` |
| `frontend/` (cualquier otro archivo) | `docs/modulos/frontend.md` |
| `backend/Planificacion/` (settings, urls, spa) | `docs/arquitectura.md` §3.3, §4.5, §6 y `docs/auditoria-arquitectura.md` |
| Varios módulos a la vez | `docs/arquitectura.md` + el documento de cada módulo |

## Después del cambio

- Si alteraste responsabilidades, modelos, endpoints, reglas, permisos,
  dependencias entre apps, comandos o variables de entorno, **actualiza el
  documento del módulo en el mismo cambio** (y `docs/arquitectura.md` si
  cambió el grafo de dependencias o un flujo).
- App nueva → crea `docs/modulos/<app>.md` con la misma estructura
  (responsabilidad, modelos, servicios, API, dependencias, pruebas, cuidado al
  modificar) y agrégala a esta tabla en las dos copias de la regla
  (`.claude/rules/documentacion.md` y `.cursor/rules/documentacion.mdc`), a
  `docs/README.md` y a `docs/AI_CONTEXT.md` §6.
- Si resolviste un hallazgo de `docs/auditoria-arquitectura.md`, márcalo como
  resuelto ahí (fecha y commit).
- Si la documentación contradice al código, avisa y corrígela; no la ignores
  en silencio.
