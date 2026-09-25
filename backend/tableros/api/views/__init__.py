"""API de tableros (`/api/v1/`), un módulo por recurso.

Convenciones (docs/plan-modulo-planificacion.md §3.1 y §8):
- 403 si la persona no puede ver o no puede hacer la acción; 404 si no existe.
- 409 si la `version` enviada está vieja: la respuesta trae el estado actual.
- 400 con `detail` para reglas de negocio (`core.errores.ReglaDeNegocio`).
"""
