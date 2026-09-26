# Planificación PALDACA — instrucciones del proyecto

Satélite federado de PALDACA Suite: gestor de tableros y tarjetas (Kanban,
Lista, Calendario, Gantt) con backend Django + DRF (`backend/`) y SPA React +
Vite (`frontend/`). Todo en español: código, comentarios, mensajes, UI.

Contexto completo del programa (se carga siempre):

@../docs/AI_CONTEXT.md

## Flujo de trabajo obligatorio

1. **Antes de modificar un módulo, lee su documento** en `docs/modulos/`
   (tabla en `docs/AI_CONTEXT.md` §6 y en `.claude/rules/documentacion.md`).
   Si el cambio cruza módulos, lee también `docs/arquitectura.md`. No basta con
   haberlo leído en otra sesión: léelo en esta.
2. Revisa `docs/plan-modulo-planificacion.md` si el cambio afecta alcance,
   permisos, avisos o decisiones (§9). Lo que no esté en la fase actual no se
   agrega sin pedirlo.
3. Implementa siguiendo las reglas de `.claude/rules/` (se cargan según los
   archivos que toques).
4. Verifica: `manage.py test` (desde `backend/`) para el backend;
   `npm run lint` y `npm run build` (desde `frontend/`) para el frontend.
   Informa resultados reales, incluidos los fallos.
5. **Actualiza la documentación en el mismo cambio** si alteraste lo que
   describe (responsabilidades, modelos, API, reglas, dependencias, comandos).

## Límites

- No modificar `backend/paldaca_sso/` (kit compartido de la Suite) salvo
  pedido explícito.
- No commitear ni hacer push sin que se pida. Rama de trabajo `dev`; commits
  con asunto corto en español, sin tildes, estilo del historial
  (`git log --oneline`).
- No leer ni mostrar `backend/.env` salvo necesidad; nunca commitear secretos.
- No tocar archivos con cambios sin commitear de otra persona sin avisar
  (revisa `git status` antes de editar algo que no creaste).
- Si encuentras que la documentación y el código no coinciden, dilo y corrige
  la documentación (o pregunta si no está claro cuál tiene razón).
