# Módulo `integracion_portal`

> Leer antes de modificar `backend/integracion_portal/`. Revisado: 2026-09-25.

## Responsabilidad

**Único punto de negocio que habla con el Portal** (la identidad la resuelve
`paldaca_sso`). Tres servicios:

| Servicio | Qué hace |
|---|---|
| `services/notificaciones.py` | Transporte de avisos a la campana del Portal: firma HMAC, bandeja de salida (`AvisoSaliente`), envío tras el commit, reintentos y lectura de la configuración de cada tipo (`config_tipo`, p. ej. el umbral de «vence pronto»). |
| `services/directorio.py` | Buscar personas del Portal con acceso al módulo (`GET /api/auth/directorio/modulos/planificacion/personas/?q=` o `?id=`) reenviando la cookie de **quien opera**; confirmar y crear la cuenta espejo de alguien que nunca entró. |
| `services/personas.py` | Cómo se presenta una persona (`persona()`, `nombre()`, `iniciales()`) y quién existe localmente para el módulo (`usuarios_del_modulo()`, `buscar()`). Siempre desde la cuenta espejo. |

Qué se avisa, a quién y con qué texto **no** se decide aquí: eso es de
`tableros.services.avisos`, `tableros.services.vencimientos`,
`equipos.services.invitaciones` y `exportacion.services.importacion`.

## Modelo

`AvisoSaliente` (`planificacion_aviso_saliente`): `tipo` (emitir | resolver),
`codigo`, `datos` (cuerpo exacto; se firma al enviar), `clave_agrupacion`,
`estado` (pendiente | enviado | descartado), `intentos`, `proximo_intento`,
`ultimo_error`, `enviado_en`. Índice `(estado, proximo_intento)`.

## Entrega fiable (outbox)

1. `emitir(...)` / `resolver(...)` guardan el `AvisoSaliente` **en la misma
   transacción** del cambio y programan el envío con `on_commit`.
2. Tras el commit se envía en un hilo aparte (`PALDACA_NOTIF_ASINCRONO=true`) o
   en línea (tests).
3. `enviar(id)` reserva el aviso con un `UPDATE` condicional (dos procesos no
   envían el mismo), respeta el orden por `clave_agrupacion` y no mantiene
   transacción abierta durante la llamada HTTP (timeout 4 s).
4. Red, 5xx o credenciales → pendiente con espera 1, 2, 4… min (techo 6 h,
   máx. 10 intentos). 400/404 → descartado (reintentar no lo arregla).
5. `python manage.py procesar_avisos` (cron cada 5 min) reintenta los
   pendientes.

Nunca se revierte el cambio local porque el Portal falle. Sin
`PALDACA_NOTIF_SECRET` (≥ 32 caracteres) no se encola nada y queda registrado.

## Contrato con el Portal

- `POST {PALDACA_PORTAL_API_URL}/api/notificaciones/eventos/` y
  `.../eventos/resolver/` con cabeceras `X-Paldaca-Client: planificacion`,
  `X-Paldaca-Timestamp`, `X-Paldaca-Signature`.
- La firma es la misma función que `Portal-Paldaca/backend/notificaciones/firma.py`
  (RN-31). El **vector de prueba compartido** en
  `tests/test_notificaciones.py` vigila que no diverjan.
- Destinatarios en **ids del Portal** (`CuentaPortal.portal_user_id`); se omite
  a quien no tenga cuenta espejo activa. `payload.url` = deep link del Portal
  (`url_en_portal(ruta)`).
- Los tipos (`planificacion.*`) se crean con **migraciones en el Portal**,
  nunca desde aquí. Catálogo en
  [`plan-modulo-planificacion.md`](../plan-modulo-planificacion.md) §6.3.

## Dependencias

- Depende de: `core`, `paldaca_sso`.
- Lo usan: `equipos`, `tableros`, `exportacion` (y `core.testing`).

## Cuidado al modificar

- Cambiar la firma exige cambiarla también en el Portal y actualizar el vector
  de prueba en los dos repos.
- No leer datos personales del navegador para crear cuentas: solo del Portal
  (`directorio.confirmar`).
- Nunca poner datos sensibles en `titulo`/`cuerpo` de un aviso.
- La caché de `config_tipo` es de 10 min (1 min si el Portal falló) y es **por
  proceso** (ver auditoría A-04).
- Los envíos enviados/descartados no se purgan todavía (auditoría A-05).

## Pruebas

`tests/test_notificaciones.py` (firma, vector compartido, outbox, reintentos,
orden) y `tests/test_directorio.py` (búsqueda, caída del Portal, confirmación).
Para probar avisos desde otras apps usar `core.testing.ConAvisos` y
`self.captureOnCommitCallbacks(execute=True)`.

## Relacionado

- [`arquitectura.md`](../arquitectura.md) §Flujo de un aviso.
- Anexo «Emitir notificaciones al Portal» de
  [`guia-integracion-programas-satelite.md`](../guia-integracion-programas-satelite.md).
