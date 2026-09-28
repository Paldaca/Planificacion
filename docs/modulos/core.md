# Módulo `core`

> Leer antes de modificar `backend/core/`. Revisado: 2026-09-28.

## Responsabilidad

Base compartida por todas las apps. No contiene reglas de negocio de
Planificación:

- **Identidad local** (`models.py`): `UsuarioPaldaca` (`AUTH_USER_MODEL`),
  `Disciplina`, `Perfil`, `Modulo`, `UsuarioModulo`. Reproducen la *forma* del
  esquema de identidad del Portal (mismos `db_table` `core_*`) pero viven en la
  BD propia de Planificación. Los llena `paldaca_sso.provisioning`, **nunca a
  mano**.
- **Roles** (`roles.py`): `es_admin_modulo(usuario)` — administrador del
  módulo según el Portal (o superusuario local de emergencia).
- **Errores de dominio** (`errores.py`): `ReglaDeNegocio`, `ConflictoDeVersion`,
  `ServicioNoDisponible` y el manejador DRF `manejador_excepciones`.
- **Comparar nombres** (`texto.py`): `clave_nombre(texto)` quita acentos,
  mayúsculas y espacios de más, como la colación de MySQL. Las reglas de
  «nombre único» (etiquetas, campos personalizados) comparan con ella para dar
  lo mismo en SQLite y en MySQL.
- **Utilidades de API** (`api.py`): `booleano(request, campo, defecto)` para leer
  booleanos del cuerpo sin la trampa `bool("false") is True`.
- **Cierre de sesión SSO** (`session_logout.py`): expira cookies y cierra la
  sesión local; lo usan `paldaca_sso.middleware` y `paldaca_sso.views`.
- **Base de pruebas** (`testing.py`): `crear_usuario`, `ApiTestCase`,
  `ConAvisos` (no es un módulo de tests; lo importan los tests de cada app).

## Dependencias

- Depende de: nada en código de producción. `testing.py` importa
  `paldaca_sso` e `integracion_portal` (solo infraestructura de pruebas).
- Lo usan: todas las apps.

## Traducción de errores (contrato con el frontend)

| Excepción | Respuesta |
|---|---|
| `ReglaDeNegocio` | 400 `{"detail": "..."}` |
| `ServicioNoDisponible` | 503 `{"detail": "..."}` |
| `django.core.exceptions.ValidationError` | 400 con el formato de DRF |
| `ConflictoDeVersion` | **no** la traduce el manejador: la atrapa la vista y responde 409 `{"detail", "actual"}` con el estado actual serializado (`tableros.api.views.comunes.conflicto`) |

Los mensajes de `ReglaDeNegocio` se muestran tal cual al usuario (el frontend
lee `detail`): escribirlos en español, en tuteo y accionables.

## Migraciones

- `0001_initial`: tablas de identidad.
- `0002_seed_modulo_planificacion`: siembra el `Modulo` con código
  `planificacion` (los tests lo necesitan: `crear_usuario` lo busca).

## Pruebas

`ApiTestCase` apaga el SSO (la identidad la pone `force_authenticate`), hace
los avisos síncronos y sin secreto, limpia la caché y parchea
`integracion_portal.services.notificaciones.config_tipo`. `ConAvisos` activa
un secreto de prueba y captura lo enviado al Portal en `self.enviados`
(`emitidos(codigo)`, `resueltos(codigo)`).

## Cuidado al modificar

- `UsuarioPaldaca` es el `AUTH_USER_MODEL`: cambiar sus campos exige migración
  y revisar `paldaca_sso.provisioning` (que lo llena) y el Portal (que define
  la forma del payload `me/`).
- No agregar aquí lógica de tableros, equipos, etc. Lo que sea común a varias
  apps pero de negocio va en la app de más abajo que lo necesite.
- Un error nuevo de dominio: subclase de `ErrorDeAplicacion` + su rama en
  `manejador_excepciones` + prueba.

## Relacionado

- [`arquitectura.md`](../arquitectura.md) §Backend por capas.
- [`paldaca_sso.md`](paldaca_sso.md).
