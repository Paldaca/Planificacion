# Guia: integrar programas satelite con Portal Paldaca (login unico)

Documento para conectar apps Django al Portal Paldaca con **login unico** y control de acceso por modulo.

**Portal Paldaca** = login principal (`http://localhost:5173/login` en dev).  
**Apps satelite** = validan identidad y permisos; no duplican el flujo de login del Portal.

---

## Dos patrones de integracion

| | **Acoplado** (legacy) | **Federado** (apps nuevas) |
|---|---|---|
| Programas actuales | Activos, Calidad, Codigos, HDT | **Nómina** (referencia) |
| Base de datos | La misma del Portal (`paldaca_db`) | **Propia** |
| `DJANGO_SECRET_KEY` | Identica a la del Portal | **Propia** |
| Cookie de sesion | `paldaca_sessionid` (compartida) | **Propia** (`nomina_sessionid`, host-only) |
| App `core/` | Copia sincronizada con el Portal | Copia con historial **bifurcado a proposito** |
| Resolucion de identidad | `SessionMiddleware` lee `django_session` compartida | `GET /api/auth/me/` server-to-server (`paldaca_sso/`) |
| Guia | **este documento** (Pasos 1–8) | [`CONTRATO_SSO_FEDERADO.md`](PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md) |

### Regla para apps nuevas

**Toda aplicacion nueva debe usar SSO federado.** No compartir BD ni `SECRET_KEY` con el Portal.
Implementacion de referencia: repo **Nomina Paldaca** (`nomina.cpaldaca.com`).

Checklist resumido (detalle en el contrato federado):

1. Copiar la app `paldaca_sso/` al satelite (autocontenida).
2. BD propia + `DATABASE_URL` en Coolify/Docker.
3. `SESSION_COOKIE_NAME=<app>_sessionid` y **`SESSION_COOKIE_DOMAIN` vacio** (nunca `.cpaldaca.com` ni `paldaca_sessionid`).
4. `PALDACA_PORTAL_URL` (shell) y `PALDACA_PORTAL_API_URL` (API) **distintos**.
5. Desplegar con `PALDACA_SSO_ENABLED=false`, `migrate`, verificar con `paldaca_sso_check`, luego encender el flag.
6. En el Portal: seed de modulo, `SATELLITE_ORIGINS`, frontend (`satellite-apps.ts`, `navigationConfig.ts`, `VITE_SATELLITE_*_URL`).

> ⚠️ Las secciones siguientes describen el patron **acoplado** (HDT, Calidad, Codigos, Activos).
> Si integras una app nueva, sigue [`CONTRATO_SSO_FEDERADO.md`](PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md), no copies la configuracion de cookie de este documento.

---

## Respuesta corta (satelites acoplados): debo copiar `core`?

**Si.** Cada programa satelite debe incluir la app Django `core` de este repositorio (misma version de modelos y migraciones).

| Copiar | No copiar |
|--------|-----------|
| Carpeta `backend/core/` completa | App `portal/` (solo del portal) |
| Mismas migraciones `core/migrations/` | `views_auth.py` del portal si no usas API JWT en el satelite |
| `PaldacaSessionMiddleware` | Frontend React del portal |

### Formas de compartir `core`

1. **Copia manual (recomendado al inicio)**  
   Copia `Portal-Paldaca/backend/core/` al proyecto satelite (ej. `core_HDT/core/` o reemplaza la app local si existia).  
   Cuando cambie el modelo en el portal, vuelves a sincronizar la carpeta.

2. **Submodulo Git (futuro)**  
   Repo `paldaca-core` publicado y cada satelite lo referencia como submodulo.

3. **Paquete pip privado (futuro)**  
   Solo si el equipo crece; no es necesario ahora.

**Regla:** todos los programas deben usar la **misma version** de migraciones `core` contra la **misma base de datos**.

---

## Arquitectura objetivo (satelites acoplados)

Patron legacy: misma BD, misma cookie, `PaldacaSessionMiddleware`.

```
Usuario → Login en Portal (5173 / API 8000)
              ↓
         Cookie paldaca_sessionid + tabla django_session
              ↓
    ┌─────────┴─────────┬─────────────┐
    ↼                   ▼             ▼
 localhost:8001    :8002         :8003
 (Activos)        (HDT)         (Codigos / Calidad)
    │                   │             │
    └─────────┬─────────┴─────────────┘
              ▼
        MySQL paldaca_db
   core_usuario, core_modulo, core_usuario_modulo, ...
```

Para **Nómina y apps nuevas** (BD propia, cookie propia, identidad via API): ver diagrama en [`CONTRATO_SSO_FEDERADO.md`](PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md) §2.

### Reglas de negocio (implementadas en `core.models`)

| Quien | Acceso a modulos | Rol dentro del modulo |
|-------|------------------|------------------------|
| **Superuser** | Todos los activos | Administrador en todos |
| **`rol=administrador`** | Solo filas en `core_usuario_modulo` | Administrador en esos modulos |
| **`rol=usuario`** | Solo filas en `core_usuario_modulo` | Usuario normal |

Metodos clave en `request.user`:

- `tiene_acceso_modulo("hdt")` — puede entrar al programa
- `es_administrador_en_modulo("hdt")` — permisos elevados en ese programa
- `modulos_habilitados()` — lista de modulos para menus

---

## Paso 0 — Prerrequisitos (una sola vez en el ecosistema)

En **Portal-Paldaca** (ya hecho si sigues este repo):

```powershell
cd Portal-Paldaca
.\venv\Scripts\python.exe backend\manage.py migrate
.\venv\Scripts\python.exe backend\manage.py seed_core_modulos
```

En `/admin` del portal:

1. Verificar modulos (`hdt`, `calidad`, `codigos`, `activos`, …).
2. Por cada usuario: asignar **Accesos a modulos** (inline en el usuario).
3. Superuser solo para TI / soporte global.

---

## Paso 1 — Preparar el proyecto satelite

Ejemplo: integrar **core_HDT** en puerto **8001**, codigo de modulo **`hdt`**.

### 1.1 Copiar la app `core`

Desde:

`Portal-Paldaca/backend/core/`

Hacia el satelite (ajusta rutas):

`core_HDT/core/`   ← carpeta de app Django llamada `core`

Archivos minimos necesarios:

```
core/
  __init__.py
  apps.py
  models.py
  admin.py
  middleware.py
  migrations/          # TODAS, en orden
  management/commands/seed_core_modulos.py
```

Opcional en satelite (solo si el portal no esta en el mismo proceso):

- `views.py`, `urls.py`, `views_auth.py`, `serializers.py` — no obligatorios si el login solo ocurre en el portal.

### 1.2 Eliminar o aislar el modelo `Usuario` antiguo

En HDT hoy existe `Usuario` con `Disciplina` y `Perfil` anidados. Plan:

1. Dejar de usar ese modelo como `AUTH_USER_MODEL`.
2. Migrar datos a `core_usuario` (script aparte; ver Paso 6).
3. Renombrar tablas de negocio HDT con prefijo `hdt_` y FK a `core.UsuarioPaldaca`.

**No** mantener dos tablas de usuarios en la misma BD.

---

## Paso 2 — Variables de entorno (`key.env`) — solo acoplados

> **Satelites federados:** usar plantilla del repo del satelite (`key.env.example`).
> Nómina: `Nomina Paldaca/key.env.example`. **No** reutilizar el `key.env` del Portal.

Usa el **mismo** `key.env` en portal y satelites acoplados (copia o enlace simbolico).

Plantilla: `Portal-Paldaca/key.env.example`

```env
DJANGO_SECRET_KEY=...                    # IDENTICA en todos los programas
SESSION_COOKIE_NAME=paldaca_sessionid
SESSION_COOKIE_DOMAIN=                     # vacio en local
PALDACA_SSO_LOGIN_URL=http://localhost:5173/login/
MYSQL_DB=paldaca_db
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_HOST=localhost
MYSQL_PORT=3306
```

Produccion:

```env
SESSION_COOKIE_DOMAIN=.cpaldaca.com
PALDACA_SSO_LOGIN_URL=https://www.cpaldaca.com/login/
```

Cargar en settings del satelite igual que el portal:

```python
from dotenv import load_dotenv
load_dotenv(BASE_DIR.parent / "key.env")  # ajustar ruta segun estructura
```

---

## Paso 3 — `settings.py` del satelite

### 3.1 Apps instaladas

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core",           # ← app copiada del portal
    "tu_app_hdt",     # app de negocio del programa
]
```

### 3.2 Usuario y base de datos

```python
AUTH_USER_MODEL = "core.UsuarioPaldaca"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("MYSQL_DB", "paldaca_db"),
        # ... mismas credenciales que el portal
    }
}
```

### 3.3 Sesion SSO

```python
SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "paldaca_sessionid")
SESSION_COOKIE_DOMAIN = os.getenv("SESSION_COOKIE_DOMAIN") or None  # vacio en local

PALDACA_SSO_LOGIN_URL = os.getenv(
    "PALDACA_SSO_LOGIN_URL", "http://localhost:5173/login/"
)
PALDACA_STRICT_SESSION_CONSISTENCY = os.getenv(
    "PALDACA_STRICT_SESSION_CONSISTENCY", "true"
)
```

En `development.py` del satelite (igual que el portal):

```python
SESSION_COOKIE_DOMAIN = None
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_DOMAIN = None
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
```

### 3.4 Middleware (orden importa)

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.middleware.PaldacaSessionMiddleware",  # ← despues de AuthenticationMiddleware
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
```

---

## Paso 4 — Migraciones en el satelite

### 4.1 Que migra cada app (sin duplicar tablas)

| App Django | Prefijo en BD | Quien ejecuta `migrate` primero |
|------------|---------------|-----------------------------------|
| `core` | `core_*` | Portal (una sola vez en la BD compartida) |
| `portal` | `portal_*` | Solo proyecto Portal-Paldaca |
| App de negocio del satelite (ej. `hdt_app`) | `{codigo}_*` | Cada programa (HDT, Calidad, …) |

- El satelite **no** crea otra vez `core_usuario`, `core_modulo`, etc. si el portal ya migro.
- El satelite **si** crea sus tablas de negocio con el prefijo de su programa.

```powershell
cd core_HDT
..\Portal-Paldaca\venv\Scripts\python.exe manage.py migrate
# core → "No migrations to apply" (normal si el portal ya migro)
# tu_app_hdt → crea hdt_* 
```

Comando util (cualquier proyecto con `core`):

```powershell
python manage.py seed_core_modulos
```

### 4.2 Regla obligatoria: prefijo por modulo/programa

Todas las tablas de **negocio** del satelite deben usar `Meta.db_table` con el **mismo codigo** que en `core_modulo` (columna `codigo`), mas guion bajo:

```
{codigo_modulo}_{nombre_descriptivo}
```

| Programa | `MODULO_CODIGO` / `core_modulo.codigo` | Prefijo tablas | Ejemplo valido | Ejemplo invalido |
|----------|----------------------------------------|----------------|----------------|------------------|
| Portal | `portal` | `portal_` | `portal_configuracion` | `configuracion` |
| HDT | `hdt` | `hdt_` | `hdt_timesheet_entry` | `timesheet` |
| Calidad | `calidad` | `calidad_` | `calidad_documento` | `documento` |
| Codigos | `codigos` | `codigos_` | `codigos_solicitud` | `solicitud_codigo` |
| Activos | `activos` | `activos_` | `activos_item` | `inventario_item` |

**Nunca** uses nombres genericos sin prefijo (`registro`, `configuracion`, `detalle`) en una BD compartida: colisionan entre apps.

#### Modelo de ejemplo (HDT)

```python
# hdt_app/models.py
from django.conf import settings
from django.db import models

class TimesheetEntry(models.Model):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,  # core.UsuarioPaldaca
        on_delete=models.CASCADE,
        related_name="hdt_timesheet_entries",
    )
  # ... campos de negocio ...

    class Meta:
        db_table = "hdt_timesheet_entry"  # prefijo hdt_ obligatorio
        verbose_name = "Registro de horas"
```

#### Checklist antes de `makemigrations`

1. Definir `PREFIJO = "hdt"` (o leer de constante `MODULO_CODIGO`) en la app de negocio.
2. En **cada** modelo nuevo o refactorizado: `class Meta: db_table = "hdt_..."`.
3. FK a usuario: siempre `settings.AUTH_USER_MODEL`, nunca modelo `Usuario` local.
4. `related_name` unico entre apps (ej. `hdt_timesheet_entries`, no `timesheet_set` generico si puede chocar).
5. Revisar migracion generada: en `operations` debe aparecer `db_table` con prefijo, no nombre por defecto `hdt_app_timesheetentry`.

```powershell
python manage.py makemigrations hdt_app --name prefijo_tablas_negocio
python manage.py sqlmigrate hdt_app 0001   # verificar SQL: CREATE TABLE hdt_...
python manage.py migrate
```

### 4.3 Renombrar tablas legacy (programa ya en produccion)

Si HDT ya tiene tablas sin prefijo (ej. `timesheet_entry`), **no** mezcles nombres viejos y nuevos:

1. Inventariar tablas actuales en phpMyAdmin o `SHOW TABLES`.
2. Por cada tabla de negocio, definir nombre destino `hdt_*`.
3. Crear migracion Django `RunSQL` o `RenameModel` + `AlterModelTable`:

```python
# Ejemplo conceptual en migracion
migrations.AlterModelTable(
    name="timesheetentry",
    table="hdt_timesheet_entry",
)
```

4. Actualizar FKs y datos si cambian nombres de columna (solo si aplica).
5. Documentar mapeo `tabla_vieja → tabla_nueva` en el repo del satelite.

Orden recomendado: **primero** usuarios a `core_usuario` (Paso 6), **despues** renombrar tablas de negocio a `{codigo}_*`.

### 4.4 Tablas que no debes prefijar ni duplicar

Estas las gestiona Django o `core` una sola vez en la BD compartida:

- `django_migrations`, `django_session`, `django_content_type`, …
- `core_usuario`, `core_disciplina`, `core_perfil`, `core_modulo`, `core_usuario_modulo`
- `auth_*` (segun configuracion; con `AUTH_USER_MODEL` custom suele usarse `core_usuario`)

No crees `hdt_usuario` ni segunda tabla de sesiones por programa.

### 4.5 Verificacion rapida post-migrate

```sql
-- En MySQL: todas las tablas del modulo deben empezar por el codigo
SHOW TABLES LIKE 'hdt_%';
```

En Django:

```powershell
python manage.py showmigrations
python manage.py dbshell
```

Criterio de exito: ninguna tabla de negocio del programa queda sin prefijo `{codigo}_`.

---

## Paso 5 — Proteger vistas y login

### 5.1 Quitar login local (o dejarlo solo para emergencias)

En HDT, desactivar o redirigir:

- `path('login/', ...)` → redirigir a `PALDACA_SSO_LOGIN_URL`

Ejemplo:

```python
from django.conf import settings
from django.shortcuts import redirect

def login_redirect(request):
    return redirect(settings.PALDACA_SSO_LOGIN_URL)
```

### 5.2 Decorador / mixin recomendado

Crear en el satelite (ej. `tu_app/decorators.py`):

```python
from functools import wraps
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.shortcuts import redirect

MODULO_CODIGO = "hdt"  # cambiar por programa: calidad, codigos, activos, etc.


def requiere_modulo_paldaca(view_func):
    @wraps(view_func)
    @login_required
    def _wrapped(request, *args, **kwargs):
        user = request.user
        if not user.tiene_acceso_modulo(MODULO_CODIGO):
            if not user.is_authenticated:
                return redirect(settings.PALDACA_SSO_LOGIN_URL)
            return HttpResponseForbidden("No tienes acceso a este programa.")
        return view_func(request, *args, **kwargs)
    return _wrapped
```

Uso:

```python
@requiere_modulo_paldaca
def dashboard(request):
    es_admin = request.user.es_administrador_en_modulo("hdt")
    ...
```

### 5.3 Admin Django del satelite

- `AUTH_USER_MODEL` ya apunta a `core.UsuarioPaldaca`.
- Puedes registrar `core` en admin (viene en `core/admin.py`).
- Usuarios se gestionan preferiblemente desde el **admin del portal** (8000) para centralizar accesos a modulos.

---

## Paso 6 — Migrar datos de usuarios (HDT y legacy)

Antes del cutover, script de migracion (ejecutar una vez):

1. Leer usuarios viejos de HDT (`auth_user` o tabla propia).
2. Crear/actualizar en `core_usuario` (mapear `username` = cedula o email).
3. Guardar tabla de mapeo `hdt_legacy_user_map (old_id, core_usuario_id)`.
4. Actualizar FKs en tablas `hdt_*` para apuntar a `core_usuario.id`.
5. Asignar `UsuarioModulo` para modulo `hdt`.

En `/admin` del portal, para cada usuario migrado:

- Rol: `usuario` o `administrador`
- Accesos a modulos: marcar `hdt` (y otros que correspondan)

---

## Paso 7 — Probar en local

Checklist por satelite:

| # | Prueba | Resultado esperado |
|---|--------|-------------------|
| 1 | Sin login, abrir `http://localhost:8001/` | Redirige a portal login |
| 2 | Login en `http://localhost:5173/login` | Cookie `paldaca_sessionid` en `localhost` |
| 3 | Abrir de nuevo `http://localhost:8001/` | Entra sin pedir password |
| 4 | Usuario sin fila en `core_usuario_modulo` para `hdt` | 403 o mensaje de sin acceso |
| 5 | Usuario con acceso y `rol=administrador` | Entra; `es_administrador_en_modulo("hdt")` True |
| 6 | Quitar acceso en admin y recargar | Sesion invalidada (middleware) o 403 |
| 7 | Superuser | Accede aunque no tenga filas en usuario_modulo |

Comandos:

```powershell
# Portal
cd Portal-Paldaca
.\venv\Scripts\python.exe backend\manage.py runserver 8000

# Frontend
cd Portal-Paldaca\frontend
npm run dev

# Satelite (ej. HDT)
cd core_HDT
..\Portal-Paldaca\venv\Scripts\python.exe manage.py runserver 8001
```

**Siempre `localhost`**, nunca mezclar con `127.0.0.1`.

Mas detalle: [sso-desarrollo-local.md](sso-desarrollo-local.md).

---

## Paso 8 — Mapa codigo de modulo por programa

El **prefijo de tablas** debe coincidir exactamente con `codigo` en `core_modulo` (ver Paso 4.2).

| Programa | Puerto dev **oficial** | Patron | `MODULO_CODIGO` | Prefijo `Meta.db_table` | App Django ejemplo |
|----------|------------------------|--------|-----------------|-------------------------|-------------------|
| Portal | 8000 / 5173 | — | `portal` | `portal_` | `portal` |
| Activos | **8001** | Acoplado | `activos` | `activos_` | `activos` |
| Hoja de tiempo (HDT) | **8002** | Acoplado | `hdt` | `hdt_` | `timesheets` / HDT |
| Codigos | **8003** | Acoplado | `codigos` | `codigos_` | `documentos` |
| Calidad | **8004** | Acoplado | `calidad` | `calidad_` | `documentos` |
| **Nómina** | **8086** (Docker) | **Federado** | `nomina` | `nomina_` / prefijos de app | `Empleados`, `paldaca_sso` |

**Fuente de verdad de puertos (acoplados):** `Portal-Paldaca/frontend/.env.development`
(`VITE_SATELLITE_*_URL`). Nómina: `VITE_SATELLITE_NOMINA_URL` → `http://localhost:8086` en dev.

Si el codigo en `core_modulo` es `hdt`, **todas** las tablas de negocio de ese repo deben ser `hdt_*`.
En Nómina la BD es **propia** (`nominadb`); el Portal solo tiene la fila en `core_modulo` para permisos.

---

## Anexo — Emitir notificaciones al Portal

El Portal es el bus: cataloga tipos, resuelve destinatarios y los muestra en la campana del
`paldaca-nav`. El satelite solo emite. Plan completo: `docs/plan-sistema-notificaciones.md`.

**Endpoint:** `POST {PORTAL_API}/api/notificaciones/eventos/`

Hay dos formas de autenticarse. **La recomendada es la firma**: no depende de quien este
operando (sirve para crons y para usuarios que no son admin del modulo).

| Requisito | Firma de servicio (recomendada) | Cookie del operador (Nomina) |
|-----------|---------------------------------|------------------------------|
| Credencial | `X-Paldaca-Timestamp` (epoch en segundos) + `X-Paldaca-Signature` | Cookie SSO reenviada (patron del directorio federado) |
| Cabecera | `X-Paldaca-Client: <codigo_modulo>` (obligatoria, y entra en la firma) | `X-Paldaca-Client` (obligatoria; defensa CSRF) |
| Permiso | La firma es valida y el cliente coincide con la cabecera | Superuser o administrador de ese modulo |
| Tipo | Existe en el catalogo del Portal, activo, `modulo_origen` = cabecera | Igual |

**Como se firma** (implementacion de referencia: `backend/notificaciones/firma.py`; los
satelites la copian en su cliente):

```python
clave = sha256(b"paldaca.notificaciones.v1:" + DJANGO_SECRET_KEY.encode()).digest()
firma = hmac_sha256(clave, f"{timestamp}.{cliente}.".encode() + cuerpo_json_bytes).hexdigest()
```

- Se firma el cuerpo **exacto** que se envia; cualquier cambio invalida la firma.
- Ventana de ±300 s respecto a la hora del Portal.
- Opcional en el cuerpo: `"emisor_id": <id del operador>` para auditoria (sin efecto en permisos).
- Vector de prueba compartido (debe dar lo mismo en todos los repos): con
  `SECRET_KEY="clave-de-prueba-paldaca"`, cuerpo `{"codigo": "x"}`, cliente `hdt`, timestamp
  `1700000000` → `3a9d0e031e7a715ce0336a9820b5f5afa39307eea7e5e78850b35b9b8f7b8a0d`.
- Clientes ya implementados: `HojadeTiempo/notificaciones/portal.py`,
  `Codigos/documentos/notificaciones_portal.py`,
  `ActivosPALDACA/activos/services/notificaciones_portal.py` (identicos; stdlib, sin
  dependencias nuevas). Variables: `PALDACA_PORTAL_API_URL`, `PALDACA_NOTIFICACIONES_ACTIVAS`.

```json
{
  "codigo": "activos.activo_asignado",
  "titulo": "Se te asigno el activo TALADRO-014",
  "cuerpo": "Juan te asigno TALADRO-014 (Taller Norte).",
  "payload": {
    "url": "https://activos.cpaldaca.com/activos/88/",
    "usuario_ids": [42]
  }
}
```

- `usuario_ids` (lista de enteros) es obligatorio si el tipo usa la audiencia `payload.usuario_ids`.
  El resto de audiencias (`modulo.usuarios`, `modulo.admins`, superadmins, suscripciones) las
  resuelve el Portal; el satelite no arma listas. Reglas: RN-30 en `BUSINESS_RULES.md`.
- Respuestas: `201 {"ok", "evento_id", "items"}`; `400` datos o payload invalidos, tipo
  desconocido o inactivo; `403` sin permiso o tipo de otro modulo.
- Un tipo nuevo se crea con una migracion en el Portal, nunca desde el satelite.
- Si el Portal no responde, el satelite registra el fallo y **no** revierte su guardado local.
- Nunca poner sueldos, claves, tokens ni cedulas completas en `titulo`/`cuerpo`.
- Si el evento trae `payload.url`, la campana lo muestra como deep link: al hacer clic el
  navegador va directo a esa URL (no es un `fetch`, es una navegacion completa — funciona igual
  si el usuario esta en el shell del Portal o dentro de un satelite embebido).

### Catalogo de tipos ya sembrados en el Portal (Fase 3)

Estos tipos ya existen en `backend/notificaciones/migrations/` — el satelite solo tiene que
emitirlos con el `codigo` exacto y el payload que su audiencia necesita. No crear un tipo nuevo
si alguno de estos ya cubre el caso.

| `codigo` | `modulo_origen` (= `X-Paldaca-Client`) | Audiencia | Payload que espera |
|----------|------------------------------------------|-----------|---------------------|
| `hdt.recordatorio_carga` | `hdt` | `payload.usuario_ids` | `usuario_ids`: quienes van por debajo del objetivo de horas de la semana (HDT lo emite los viernes) |
| `hdt.corte_proximo` | `hdt` | `payload.usuario_ids` | `usuario_ids`: quienes aun tienen abierta la hoja de la semana anterior (martes, antes del cierre) |
| `hdt.hoja_cerrada` | `hdt` | `payload.usuario_ids` | `usuario_ids`: duenos de las hojas que cerro el proceso automatico |
| `hdt.hojas_abiertas_limite` | `hdt` | `payload.usuario_ids` | `usuario_ids`: quienes quedaron con el maximo de hojas abiertas |
| `hdt.hoja_reabierta` | `hdt` | `payload.usuario_ids` | `usuario_ids`: el dueno de la hoja reabierta por un administrador |
| `activos.activo_creado` | `activos` | `modulo.admins` + `payload.usuario_ids` | `usuario_ids` opcional: el custodio, si ya se conoce |
| `activos.activo_asignado` | `activos` | `payload.usuario_ids` | `usuario_ids`: el custodio (obligatorio) |
| `codigos.solicitud_anulacion` | `codigos` | `modulo.admins` + superadmins + `payload.usuario_ids` | `usuario_ids`: titulares del permiso `documentos.puede_anular_codigo` con acceso a Codigos (el Portal no ve ese permiso); `url` a la bandeja de solicitudes |
| `calidad.documento_publicado` | `calidad` | `modulo.usuarios` | ninguno especial; `url` recomendado al documento |
| `nomina.recibo_disponible` | `nomina` | `payload.usuario_ids` | `usuario_ids`: el empleado vinculado al Portal. **Nunca** el monto en `titulo`/`cuerpo` |

`activos.activo_creado` sin `usuario_ids` en el payload solo llega a los administradores de
Activos (comportamiento por defecto, "admins + asignado" del plan de notificaciones); si el alta
ya conoce al custodio, incluirlo evita que se enteren dos veces (por admin y por asignación).

---

## Errores frecuentes

| Sintoma | Causa | Solucion |
|---------|-------|----------|
| Satelite federado no autentica / cookie rara | Copiaste config acoplada (`paldaca_sessionid`, `.cpaldaca.com`) | Ver [`CONTRATO_SSO_FEDERADO.md`](PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md) §3 y §6 R-03 |
| Satelite pide login otra vez | `SECRET_KEY` distinta o cookie con dominio `cpaldaca.com` en local | Mismo `key.env`; `SESSION_COOKIE_DOMAIN` vacio |
| Cookie no aparece tras login en 5173 | Frontend sin `credentials: include` | Ya corregido en portal; satelite solo lee cookie |
| `InconsistentMigrationHistory` | Migraciones `core` distintas entre repos | Sincronizar carpeta `core/migrations` |
| Dos tablas de usuarios | No migraste AUTH_USER_MODEL | Un solo `core.UsuarioPaldaca` |
| Admin ve todos los modulos pero HDT dice 403 | Falta fila en `core_usuario_modulo` | Asignar modulo en admin (salvo superuser) |
| Error al migrar / tabla ya existe | Tabla sin prefijo o nombre duplicado entre apps | `Meta.db_table = "{codigo}_..."` en todos los modelos |
| `hdt_app_timesheetentry` en BD | Olvidaste `db_table` | Migracion con `db_table` explicito y rename si hay datos |

---

## Prompts para Cursor (copiar en cada repo satelite)

### Prompt — App nueva (SSO federado, recomendado)

```
Integra este proyecto Django con Portal Paldaca usando SSO FEDERADO.
Lee Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md y copia
paldaca_sso/ desde Nomina Paldaca como referencia.

Codigo de modulo: <codigo>
Dominio produccion: <app>.cpaldaca.com

1. BD propia + DATABASE_URL (Coolify). SECRET_KEY propia.
2. SESSION_COOKIE_NAME=<app>_sessionid, SESSION_COOKIE_DOMAIN vacio.
3. PALDACA_PORTAL_URL vs PALDACA_PORTAL_API_URL separados.
4. Deploy dark (PALDACA_SSO_ENABLED=false), migrate, paldaca_sso_check, luego true.
5. Embed: PALDACA_FRAME_ANCESTORS con cpaldaca.com.
No uses paldaca_sessionid ni BD compartida con el Portal.
```

### Prompt 1 — Auditoria inicial (acoplado / legacy)

```
Integra este proyecto Django con el SSO de Portal Paldaca siguiendo
docs/guia-integracion-programas-satelite.md del repo Portal-Paldaca.

Codigo de modulo de esta app: hdt
Puerto dev: 8001

1. Lista AUTH_USER_MODEL, INSTALLED_APPS, MIDDLEWARE y DATABASES actuales.
2. Indica si existe modelo Usuario propio y tablas que FK a el.
3. Propone plan de cambios minimos sin romper datos de negocio.
```

### Prompt 2 — Aplicar integracion

```
Copia/ajusta la app core desde Portal-Paldaca/backend/core/.
Configura settings: AUTH_USER_MODEL, SESSION_COOKIE_*, PaldacaSessionMiddleware,
misma BD que key.env del portal.

Crea decorador requiere_modulo_paldaca con MODULO_CODIGO='hdt'.
Redirige login local a PALDACA_SSO_LOGIN_URL.
No dupliques tablas core_* en migraciones del satelite.

Aplica regla de prefijos (Paso 4.2): en cada modelo de negocio Meta.db_table = 'hdt_*'.
FK a settings.AUTH_USER_MODEL. Revisa sqlmigrate antes de migrate.
```

### Prompt 3 — Migracion de usuarios HDT

```
Genera script de migracion de usuarios del modelo Usuario antiguo de HDT
hacia core.UsuarioPaldaca. Incluye tabla de mapeo old_id->new_id y pasos
para actualizar FKs en tablas hdt_*. Documenta rollback.
```

---

## Relacion con otros documentos

| Documento | Contenido |
|-----------|-----------|
| [**CONTRATO_SSO_FEDERADO.md**](PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md) | **Apps nuevas** — BD propia, `paldaca_sso`, cookie-forwarding |
| [CONTRATO_EMBED.md](PALDACA_SUITE/CONTRATO_EMBED.md) | Iframe en el Portal (`PALDACA_FRAME_ANCESTORS`, postMessage) |
| [plan de accion.md](../plan%20de%20accion.md) | Vision global, BD unificada (acoplados), roadmap |
| [sso-desarrollo-local.md](sso-desarrollo-local.md) | Cookies, puertos, pruebas SSO (acoplados) |
| [key.env.example](../key.env.example) | Variables del Portal y satelites acoplados |
| `Nomina Paldaca/key.env.example` | Plantilla produccion federada (Nómina) |
| [README.md](../README.md) | Arranque del portal |

---

## Resumen ejecutivo

### Apps nuevas → SSO federado

1. Seguir [`CONTRATO_SSO_FEDERADO.md`](PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md) y el repo **Nomina Paldaca**.
2. BD propia, `SECRET_KEY` propia, cookie de sesion **host-only** distinta a `paldaca_sessionid`.
3. Identidad via `GET /api/auth/me/`; permisos derivados de `modulos` en el payload.
4. Portal: seed del modulo + frontend; encender embed cuando el satelite este listo.

### Satelites acoplados (legacy: HDT, Calidad, Codigos, Activos)

1. **Si, copia `backend/core/`** a cada satelite (misma BD, mismas migraciones).
2. **Portal** = unico login (React + `auth.login` + cookie `paldaca_sessionid`).
3. **Satelites** = `AUTH_USER_MODEL` + `PaldacaSessionMiddleware` + `tiene_acceso_modulo("<codigo>")`.
4. **Asignacion de modulos** en `/admin` del portal (`core_usuario_modulo`).
5. **Superuser** = unico rol con acceso global sin asignacion manual.
6. **Tablas de negocio** = siempre `Meta.db_table` con prefijo `{codigo}_` (igual que `core_modulo.codigo`).

Cuando termines un satelite, marca en `plan de accion.md` el checklist de la seccion 4.
