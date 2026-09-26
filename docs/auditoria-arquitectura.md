# Auditoría de arquitectura — septiembre 2026

> Fecha: 2026-09-25 · Rama: `dev` (fase 4 incluida; revisado contra el commit
> `6e9157a`) · Alcance: backend Django, frontend React,
> configuración y operación. La auditoría anterior (organización del backend)
> está en [`plan-modulo-planificacion.md`](plan-modulo-planificacion.md) §3.3.

## 1. Método

1. Lectura de `settings.py`, `urls.py`, modelos, servicios, permisos y vistas
   de cada app, y de la estructura del frontend.
2. **Grafo de dependencias real** entre apps a partir de los `import`
   (excluyendo tests y migraciones), marcando los diferidos.
3. Ejecución de la suite: `manage.py test` → **109 pruebas OK en ~20 s**.
4. `manage.py check --deploy` con `DJANGO_DEBUG=false` y una clave de prueba.
5. Comprobación de nombres de tabla de todos los modelos (`apps.get_models()`).
6. Contraste con las reglas del plan (§3.1) y del contrato federado.

Severidad: **Alta** (bloquea producción o riesgo de seguridad) · **Media**
(riesgo real acotado o deuda que crece) · **Baja** (higiene, mantenibilidad) ·
**Info** (observación, sin acción obligatoria).

## 2. Resumen

La arquitectura es **sana y coherente con su diseño**: capas claras, grafo de
apps acíclico, reglas en el backend, transacciones bien delimitadas, entrega
fiable de avisos y buena cobertura de pruebas de backend (109 pruebas). Los hallazgos se
concentran en **configuración para producción** (valores por defecto
inseguros, `check --deploy` en rojo, SQLite), **operación con varios procesos**
(caché local, bandeja sin purga) y **calidad del frontend** (sin pruebas, sin
CI, componentes muy grandes). Ninguno exige rediseñar.

| ID | Severidad | Hallazgo |
|---|---|---|
| A-01 | Alta | `DEBUG` y `SECRET_KEY` con valores por defecto inseguros si falta la variable de entorno |
| A-02 | Alta | SQLite como única BD configurada (D-06 pendiente) |
| A-03 | Media | `manage.py check --deploy` falla (1 error, 5 avisos) |
| A-04 | Media | Caché en memoria por proceso: feriados y umbral pueden quedar desfasados entre workers |
| A-05 | Media | La bandeja `AvisoSaliente` crece sin límite |
| A-10 | Media | Sin pruebas de frontend ni integración continua |
| A-06 | Baja | `gantt` y `exportacion` dependen de la capa HTTP interna de `tableros` |
| A-07 | Baja | `equipos` traduce ids del Portal sin pasar por `integracion_portal` |
| A-08 | Baja | `manage.py` de la raíz roto y `Planificacion/db.py` vacío versionado |
| A-09 | Baja | Reglas espejadas en el frontend (vencimiento, filtros) sin prueba de contrato |
| A-11 | Baja | Componentes y módulos del frontend de más de 800 líneas |
| A-12 | Baja | Sin configuración de `LOGGING` |
| A-13 | Info | Importación: XML con `ElementTree` y generación síncrona — XML ✅ resuelto 2026-09-26 (`e81f239`) |
| A-14 | Info | Utilidades de test dentro de código de producción |

## 3. Fortalezas verificadas

- **Grafo de apps acíclico** (ver [`arquitectura.md`](arquitectura.md) §3.2):
  `core ← paldaca_sso ← integracion_portal ← equipos/calendario ← tableros ←
  gantt ← exportacion`. La única reacción «hacia arriba» usa una señal
  (`tarjeta_trasladada`).
- **Capas respetadas**: vistas delgadas (permiso → servicio → serializer),
  servicios transaccionales con argumentos por nombre, lecturas en QuerySet,
  permisos como funciones puras. Los serializers no escriben.
- **Errores de dominio independientes de HTTP** con un único traductor
  (`core.errores.manejador_excepciones`).
- **Integridad en la BD**, no solo en código: `fecha_fin ≥ fecha_inicio`,
  número de tarjeta único por tablero, coherencia tipo↔dueño del tablero,
  dependencia no a sí misma, un solo responsable/miembro por par.
- **Concurrencia optimista** consistente (`version` + `select_for_update` +
  409 con el estado actual) y PATCH en serie por tarjeta en el frontend.
- **Outbox de avisos** bien resuelto: inserción en la transacción del cambio,
  envío tras el commit, reserva con `UPDATE` condicional (sin doble envío),
  orden por `clave_agrupacion`, reintentos con espera creciente y descarte de
  errores no recuperables. Un Portal caído no rompe nada.
- **Seguridad del SSO**: API cerrada por defecto (`IsAuthenticated`), checks
  de arranque para la cookie de sesión y su dominio, cuentas espejo sin
  contraseña usable ni superusuario, CSP `frame-ancestors` en lugar de
  `X-Frame-Options`.
- **Todas las tablas de negocio** con prefijo `planificacion_` (verificado).
- **Frontend**: lógica pura separada en `lib/`, páginas con carga diferida,
  chunks de librerías separados, refresco automático que respeta R-07.
- **Pruebas de backend** organizadas por funcionalidad con escenarios comunes;
  109 pasan.

## 4. Hallazgos

### A-01 · Alta · Valores por defecto inseguros en `settings.py`

**Evidencia.** `backend/Planificacion/settings.py:43`
`DEBUG = _bool_env("DJANGO_DEBUG", "true")` y `:39` `SECRET_KEY` con
`"django-insecure-..."` por defecto. `PALDACA_PORTAL_URL`/`PALDACA_PORTAL_API_URL`
(`:238`) eligen `localhost` si `DEBUG` es verdadero.

**Impacto.** Un despliegue al que le falte `DJANGO_DEBUG` corre con
`DEBUG=True` (páginas de error con trazas y configuración), clave pública y
apuntando al Portal en `localhost`. El propio docstring de `settings.py` dice
que se quería evitar exactamente este error del Portal. El check
`paldaca_sso.W003` solo avisa.

**Recomendación.** Invertir los defaults: `DJANGO_DEBUG` por defecto `"false"`
(el `.env.example` ya pone `true` para local) y, con `DEBUG=False`, fallar al
arrancar si `DJANGO_SECRET_KEY` falta o empieza por `django-insecure-`.

### A-02 · Alta · SQLite como única base de datos

**Evidencia.** `settings.py:117` solo define SQLite. Decisión D-06 abierta.

**Impacto.** Con varios workers de gunicorn, SQLite serializa escrituras
(errores `database is locked` bajo carga) y `select_for_update` no bloquea
filas (la numeración de tarjetas y el control de versión dependen del
bloqueo global de SQLite). Riesgo de pérdida de datos si el volumen del
contenedor no es persistente.

**Recomendación.** Antes de datos reales: `DATABASES` desde `DATABASE_URL` /
`MYSQL_*` (patrón de Nómina), MySQL propia (nunca la del Portal), `CONN_MAX_AGE`
y correr la suite contra MySQL una vez.

### A-03 · Media · `check --deploy` en rojo

**Evidencia.** Con `DJANGO_DEBUG=false`:

- `mail.E001` (error): `MAILERS` usa el backend de consola (`settings.py:228`).
- `security.W002`: falta `XFrameOptionsMiddleware` — **intencional** (el
  framing lo controla la CSP; reponerlo rompe el embed) pero no está
  silenciado.
- `security.W004`/`W008`: sin HSTS ni redirección a HTTPS.
- `security.W012`/`W016`: `SESSION_COOKIE_SECURE`/`CSRF_COOKIE_SECURE` falsos
  por defecto (`settings.py:183`).

**Impacto.** Un paso de CI/CD con `check --deploy` fallaría; las cookies viajan
sin `Secure` si alguien olvida la variable.

**Recomendación.** `SILENCED_SYSTEM_CHECKS = ["security.W002"]` con el comentario
del porqué; `MAILERS` desde el entorno (o SMTP) si algún día se envía correo;
cookies `Secure` por defecto cuando `DEBUG=False`; decidir HSTS y
`SECURE_PROXY_SSL_HEADER` según cómo termine TLS el proxy de Coolify.

### A-04 · Media · Caché por proceso

**Evidencia.** No hay `CACHES` → `LocMemCache` por proceso. La usan: feriados
(`calendario/services/dias_habiles.py:23`, 5 min, invalidación por versión en
`:56`), configuración de tipos del Portal (`notificaciones.py`, 10 min) y el
*breaker* del SSO.

**Impacto.** Con N workers, dar de alta o baja un feriado solo invalida la
caché del worker que atendió la petición: los demás calculan días hábiles,
vencimientos y Gantt con feriados viejos hasta 5 min. Acotado, pero produce
resultados distintos según el worker.

**Recomendación.** Al migrar a MySQL, `DatabaseCache` (sin infraestructura
nueva) o Redis si ya existe en el servidor. Mientras tanto, documentado.

### A-05 · Media · Bandeja de avisos sin purga

**Evidencia.** `integracion_portal/services/notificaciones.py`: los avisos
pasan a `enviado`/`descartado` pero nada los borra; `procesar_pendientes`
(`:271`) solo mira pendientes.

**Impacto.** `planificacion_aviso_saliente` crece indefinidamente (cada
asignación, mención, comentario y vencimiento genera filas).

**Recomendación.** En `procesar_avisos`, borrar enviados de más de 30 días y
descartados de más de 90 (conservar descartados más tiempo para diagnóstico).
Es un borrado de datos técnicos, no de negocio.

### A-06 · Baja · Acoplamiento a la capa HTTP de `tableros`

**Evidencia.** `gantt/api/views.py:19-20` importa
`tableros.api.serializers.CardResumenSerializer` y
`tableros.api.views.comunes` (`obtener_tablero`, `obtener_card`, `contexto`,
`conflicto`, `detalle_card`); `exportacion/api/views.py:17` importa
`obtener_tablero`.

**Impacto.** Un cambio interno de las vistas de `tableros` rompe otras apps.
No es un ciclo, pero `comunes.py` funciona como API pública sin declararlo.

**Recomendación.** Declararlo: moverlo a `tableros/api/acceso.py` (como
`equipos/api/acceso.py`) con docstring «API entre apps», o documentar
`comunes.py` como tal. Sin prisa: hacerlo la próxima vez que se toque.

### A-07 · Baja · Traducción de ids del Portal fuera de `integracion_portal`

**Evidencia.** `equipos/services/candidatos.py:18,45` consulta
`paldaca_sso.models.CuentaPortal` para mapear `portal_user_id` → usuario local.

**Impacto.** Contradice la regla del plan (§3.1) de que esa traducción pasa
solo por `integracion_portal`; es el único caso fuera de esa app.

**Recomendación.** Función `usuarios_por_portal_id(ids)` en
`integracion_portal/services/personas.py` y usarla desde `candidatos.py`.

### A-08 · Baja · Archivos muertos en la raíz y en el paquete

**Evidencia.** `manage.py` de la raíz falla (`ModuleNotFoundError: No module
named 'Planificacion'`): el paquete vive en `backend/`. `backend/Planificacion/db.py`
está versionado vacío.

**Impacto.** Confunde a personas y asistentes («¿cuál `manage.py` uso?»).

**Recomendación.** Confirmar que `iniciar.ps1` del Portal no los usa y
borrarlos (o que el `manage.py` raíz agregue `backend/` a `sys.path`).

### A-09 · Baja · Reglas espejadas en el frontend

**Evidencia.** `frontend/src/lib/vencimiento.ts:27` calcula «vence pronto» con
umbral fijo `2` y sin feriados (el backend usa el umbral del Portal y el
calendario laboral); se usa para actualizaciones optimistas
(`api/queries.ts:240, 462, 831`). `lib/filtros.ts:16` y
`exportacion/services/datos.py:36` implementan los mismos filtros por
separado («exportar lo que se ve»). Hoy coinciden.

**Impacto.** Tras una edición optimista puede verse un instante un estado de
vencimiento distinto al real (el servidor lo corrige al responder). Los
filtros pueden divergir sin que nada lo detecte.

**Recomendación.** Enviar `umbral` en el detalle del tablero y usarlo en el
espejo; una prueba de contrato (mismos casos en Vitest y en `test_exportacion`)
para los filtros.

### A-10 · Media · Sin pruebas de frontend ni CI

**Evidencia.** `frontend/package.json` no tiene runner de pruebas; no hay
`.github/workflows` ni equivalente. La única red del frontend es `tsc -b` y
oxlint, ejecutados a mano.

**Impacto.** La lógica pura más delicada (`lib/gantt.ts`, `lib/calendarioMes.ts`,
`lib/dias.ts`, `lib/filtros.ts`) y la cola optimista de `queries.ts` no tienen
pruebas; nada impide integrar a `dev` con la suite de backend en rojo.

**Recomendación.** Vitest para `lib/` (empezar por `gantt.ts` y
`calendarioMes.ts`); un pipeline con `manage.py test`, `npm run lint` y
`npm run build` en cada push/PR.

### A-11 · Baja · Archivos demasiado grandes en el frontend

**Evidencia.** `components/gantt/VistaGantt.tsx` 1097 líneas,
`api/queries.ts` 991, `components/card/CardDialogo.tsx` 815,
`pages/EquipoPage.tsx` 549.

**Impacto.** Revisiones difíciles y conflictos frecuentes (la fase 4 ya
modifica `queries.ts`).

**Recomendación.** Dividir al tocarlos: `api/queries/` por recurso
(`tableros.ts`, `tarjetas.ts`, `equipos.ts`…, reexportados desde un índice);
`VistaGantt` en cabecera, filas, barras, flechas y bandeja.

### A-12 · Baja · Sin `LOGGING`

**Evidencia.** `settings.py` no define `LOGGING`. `planificacion.notificaciones`
registra `NOTIFICACION_ENVIADA` en INFO.

**Impacto.** En producción solo llegan WARNING+ a stderr (manejador de último
recurso); se pierde la traza de envíos correctos.

**Recomendación.** `LOGGING` a consola con formato y nivel por variable de
entorno (`LOG_LEVEL`).

### A-13 · Info · Importación

- ✅ **Resuelto 2026-09-26 (`e81f239`):** `exportacion/services/mspdi.py`
  rechaza cualquier XML con `DOCTYPE`/`ENTITY` antes de parsearlo con
  `ElementTree` (un MSPDI legítimo nunca los trae), sin agregar `defusedxml`.
  En el mismo commit: las celdas del Excel exportado nunca se guardan como
  fórmula (inyección con títulos que empiezan por `=`), lectura de Excel bajo
  demanda con tope de filas y hoja Gantt por semanas si pasa de 120 000
  celdas.
- Límites correctos (5 MB, 1000 filas; `read_only=True` en openpyxl).
- Exportar e importar son síncronos dentro de la petición; el plan prevé
  descarga diferida para archivos grandes.

### A-14 · Info · Utilidades de test en código de producción

- `core/testing.py` hace que `core` (capa base) importe `paldaca_sso` e
  `integracion_portal`. Solo lo usan los tests.
- `tableros/management/commands/revisar_vencimientos.py:9,20` usa
  `django.test.utils.override_settings` para forzar el envío síncrono. Funciona,
  pero sería más claro un modo explícito en `integracion_portal` (p. ej. un
  gestor de contexto `envio_sincrono()`) que no dependa de utilidades de test.

## 5. Plan de acción recomendado

| Orden | Acción | Hallazgos | Esfuerzo |
|---|---|---|---|
| 1 | Defaults seguros en `settings.py` + `check --deploy` en verde | A-01, A-03 | S |
| 2 | MySQL propia + caché compartida (`DatabaseCache`) + `LOGGING` | A-02, A-04, A-12 | M |
| 3 | Purga de la bandeja de avisos en `procesar_avisos` | A-05 | S |
| 4 | CI (test + lint + build) y Vitest para `lib/` | A-10, A-09 | M |
| 5 | Limpieza: `manage.py` raíz, `db.py`, `usuarios_por_portal_id`, API de acceso de `tableros` | A-06, A-07, A-08 | S |
| 6 | Dividir `queries.ts` y `VistaGantt.tsx` al tocarlos | A-11 | M |

## 6. Checklist de despliegue (derivado)

- [ ] `DJANGO_DEBUG=false`, `DJANGO_SECRET_KEY` propia y larga.
- [ ] `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` del dominio real.
- [ ] `SESSION_COOKIE_SECURE=true` (y por ende CSRF).
- [ ] MySQL propia configurada y migrada.
- [ ] `PALDACA_SSO_ENABLED=true`, `PALDACA_PORTAL_URL`, `PALDACA_PORTAL_API_URL`, `PALDACA_FRAME_ANCESTORS`.
- [ ] `PALDACA_NOTIF_SECRET` = `PALDACA_NOTIF_SECRET_PLANIFICACION` del Portal; `planificacion` en `PALDACA_NOTIF_ESTRICTO`.
- [ ] `npm run build` y `collectstatic`.
- [ ] Scheduled Tasks: `procesar_avisos` (5 min) y `revisar_vencimientos` (diario).
- [ ] `manage.py check --deploy` sin errores.
- [ ] Recién entonces, `planificacion` en `VITE_EMBEDDED_MODULES` del Portal.
