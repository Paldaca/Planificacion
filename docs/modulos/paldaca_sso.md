# Módulo `paldaca_sso` (SSO federado y embed)

> Leer antes de modificar `backend/paldaca_sso/`. Revisado: 2026-09-25.
>
> **Código copiado del kit de satélites federados de la Suite.** Por regla del
> proyecto no se toca: un cambio aquí debe hacerse primero en el kit/Portal y
> copiarse. Si de verdad hace falta un ajuste local, documentarlo en este
> archivo y en el commit.

## Responsabilidad

Resolver **quién es el usuario** a partir de la sesión del Portal y permitir
que la app viva dentro del iframe del Portal. Toda la superficie de
integración de identidad queda concentrada en esta app.

| Archivo | Qué hace |
|---|---|
| `middleware.py` | `PaldacaSsoBootstrapMiddleware`: crea/revalida la sesión local reenviando la cookie del Portal (`paldaca_sessionid`) a `GET {PALDACA_PORTAL_API_URL}/api/auth/me/`. Solo gatea `conf.gated_prefixes()` (por defecto `/api/*` menos los prefijos no gateados); el shell de la SPA se sirve siempre. |
| `client.py` | Cliente HTTP al Portal con *circuit breaker* en `django.core.cache` (por proceso). |
| `identity.py` | Parseo validado del payload de `me/` (lee `modulos`, no `permisos`). |
| `provisioning.py` | `upsert_mirror_user()`: crea/actualiza la **cuenta espejo** (`UsuarioPaldaca` + `CuentaPortal`). Contraseña inutilizable, jamás `is_superuser` por espejo. |
| `revision.py` | Hash de la identidad remota para saber si hay que repetir el upsert. |
| `models.py` | `CuentaPortal` (`paldaca_sso_cuenta_portal`): `usuario` 1–1, `portal_user_id` (clave de unión), `activo_en_portal`, `revision`, `payload_snapshot`. |
| `views.py` / `urls.py` | `/api/auth/me/`, `/api/auth/logout/`, `/api/auth/resync/` (sin vista de login: el frontend nunca envía credenciales). |
| `embed.py` | `PaldacaEmbedMiddleware`: cabecera CSP `frame-ancestors` (reemplaza a `X-Frame-Options`) y detección embebido/suelto. |
| `checks.py` | Checks de arranque: `E001` nombre de cookie de sesión = la del Portal; `E002` `SESSION_COOKIE_DOMAIN` no vacío; `W003` `SECRET_KEY` por defecto. |
| `management/commands/paldaca_sso_check.py` | Diagnóstico de la configuración SSO. |

## Flujo de una petición `/api/*`

1. Sesión *break-glass* → pasa sin revalidar (hoy desactivado:
   `PALDACA_SSO_BREAKGLASS_ENABLED=false`).
2. Usuario ya autenticado → solo revalida si cambió la cookie del Portal o
   venció `PALDACA_SSO_REVALIDATE_SECONDS` (300 s).
3. Sin sesión local → bootstrap con la cookie del Portal; si no hay cookie,
   401 JSON (el frontend decide el redirect al login del Portal).
4. Degradación: 401/403 del Portal = negativa autoritativa (cierra ya);
   timeout/5xx/JSON inválido = `PortalUnavailable` → modo gracia
   (`PALDACA_SSO_GRACE_SECONDS`, 1800 s).
5. Usuario sin el módulo `planificacion` → 403.

Con `PALDACA_SSO_ENABLED=false` (default, *deploy dark*) el middleware no
actúa; la API sigue cerrada porque DRF exige `IsAuthenticated` por defecto.

## Dependencias

- Depende de: `core` (`models`, `session_logout`).
- Lo usan: `integracion_portal` (cliente, `conf`, `CuentaPortal`,
  `upsert_mirror_user`), `equipos.services.candidatos` (`CuentaPortal`, ver
  auditoría A-07), `core.testing`.

## Reglas que no se rompen

- `SESSION_COOKIE_NAME` **nunca** `paldaca_sessionid`; `SESSION_COOKIE_DOMAIN`
  vacío (host-only). Los checks E001/E002 abortan el arranque.
- No reponer `XFrameOptionsMiddleware`: rompe el embed en silencio.
- La clave de unión es `portal_user_id`, nunca email ni username.
- La cuenta espejo solo se crea con datos confirmados por el Portal.
- En local usar `localhost` (no `127.0.0.1`): la cookie del Portal es host-only.

## Pruebas

`paldaca_sso/tests/test_embed.py` (CSP y detección de embed). El bootstrap
completo solo se probó con un usuario de demostración (pendiente del plan:
prueba con sesión real del Portal).

## Relacionado

- `Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md` y
  `CONTRATO_EMBED.md` (repo del Portal).
- [`guia-integracion-programas-satelite.md`](../guia-integracion-programas-satelite.md).
- [`integracion_portal.md`](integracion_portal.md), [`frontend.md`](frontend.md) §Auth y embed.
