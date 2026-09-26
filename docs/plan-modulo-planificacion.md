# Plan del módulo Planificación — diseño por fases

> Estado (septiembre 2026): **fases 0–3 implementadas** y auditadas (tableros,
> cards, equipos por invitación, avisos en el Portal, checklist, historial,
> menciones, vistas Lista / Calendario / Gantt, dependencias, calendario
> laboral), **fase 4 implementada** (Excel y MS Project de ida y vuelta) y
> **fase 5 implementada** en el alcance elegido (plantillas, etiquetas, campos
> personalizados y límite por columna).
> El detalle de lo hecho y lo pendiente está en §7 («Estado del plan»).
> Stack: **Django + DRF** (`backend/`) y **React + Vite + TypeScript** (`frontend/`).
> Integración: satélite **federado** del Portal Paldaca — ver
> [`guia-integracion-programas-satelite.md`](guia-integracion-programas-satelite.md) y
> `Portal-Paldaca/docs/PALDACA_SUITE/CONTRATO_SSO_FEDERADO.md`.

---

## 1. Visión

Planificación es un gestor de trabajo por **tableros** con **cards**. Cada card
es una actividad con fecha de inicio, fecha final, descripción, urgencia,
responsables y comentarios. Los tableros pueden ser **personales** (uno por
usuario) o de **equipo** (varios por equipo).

Un mismo tablero se ve de varias formas — **Tablero, Lista, Calendario y
Gantt** — y el Gantt se puede exportar a **Excel** y **MS Project**.

Todo ocurre dentro del Portal: los usuarios entran con el login único, el
módulo se ve embebido en `cpaldaca.com/planificacion` y los avisos llegan a la
campana de notificaciones del Portal.

### Principios de diseño

1. **Flexible, con buenos predeterminados.** Todo es editable (columnas, cards,
   reglas del Gantt), pero el caso normal funciona sin configurar nada.
2. **Una fuente de datos, varias vistas.** Tablero, Lista, Calendario y Gantt
   leen y escriben las mismas cards; no hay datos exclusivos de una vista.
3. **El Portal es dueño de la identidad; Planificación es dueña de sus datos.**
   Usuarios, acceso al módulo y notificaciones son del Portal. Equipos,
   tableros y cards viven solo en la BD de Planificación.
4. **Preparado para sincronizarse desde el día uno.** Toda referencia a una
   persona se puede traducir a su `portal_user_id`; toda card tiene una URL
   estable que funciona dentro y fuera del Portal.

---

## 2. Glosario

| Término | Significado |
|---|---|
| **Equipo** | Grupo de personas creado dentro del módulo. Tiene administradores, miembros y lectores. |
| **Invitación** | Única forma de entrar a un equipo: un administrador invita y la persona **acepta o rechaza**. Genera un aviso en la campana del Portal. |
| **Tablero personal** | Tablero privado de un usuario. Puede tener varios: el primero («Mi tablero») se crea solo en su primer ingreso y los demás al crear un tablero **sin elegir equipo**. |
| **Tablero de equipo** | Tablero visible y editable por los miembros de un equipo. Un equipo puede tener varios. |
| **Columna** | Etapa del flujo de trabajo. Predeterminadas: **Tareas**, **En curso**, **Hecho**. |
| **Card** | Actividad: título, descripción, inicio, fin, urgencia, responsables, comentarios. |
| **Estado** | La columna donde está la card. Mover la card cambia su estado. |
| **Urgencia** | Prioridad, independiente del estado: Baja, Media, Alta, Crítica. |
| **Vencimiento** | Calculado a partir de la fecha final: al día, *vence pronto* o *vencida*. Nunca se marca a mano. |
| **Columna final** | Columna cuyas cards cuentan como terminadas (por defecto, **Hecho**). |
| **Vista** | Forma de mostrar un tablero: Tablero, Lista, Calendario o Gantt. |

---

## 3. Arquitectura

```
Navegador ──► Portal (cpaldaca.com)  ── iframe /planificacion ──►  Planificación
                 ▲                                                  │
                 │  GET /api/auth/me/ (cookie-forwarding, SSO)      │
                 ├──────────────────────────────────────────────────┤
                 │  POST /api/notificaciones/eventos/ (firmado)     │
                 ├──────────────────────────────────────────────────┤
                 │  GET directorio/modulos/planificacion/personas/  │
                 └──────────────────────────────────────────────────┘

Planificación
  backend/   Django + DRF — API REST, reglas de negocio, cálculo del Gantt,
             exportaciones, emisión de notificaciones, tareas programadas
  frontend/  React SPA — vistas, arrastrar y soltar, estado de servidor
  BD propia  (SQLite en desarrollo; MySQL propia antes de producción)
```

### 3.1 Backend (Django)

Una app por dominio; ninguna depende de otra "hacia arriba" (`tableros`
depende de `equipos`, nunca al revés):

| App | Responsabilidad |
|---|---|
| `core` | Usuario espejo del Portal, roles (`roles.py`), errores de dominio (`errores.py`), utilidades de API (`api.py`) y base de pruebas (`testing.py`) |
| `paldaca_sso` | SSO federado con el Portal (copiado del kit; no se toca) |
| `integracion_portal` | ÚNICO punto que habla con el Portal: notificaciones firmadas con bandeja de salida, directorio de personas, traducción usuario local ↔ `portal_user_id` |
| `equipos` | Equipos, membresías con roles, invitaciones y quién puede qué en un equipo |
| `calendario` | Calendario laboral: feriados nacionales, puntuales y móviles (Carnaval, Semana Santa); días hábiles para duraciones, vencimientos y Gantt |
| `tableros` | Tableros, columnas (con límite suave), cards, responsables, etiquetas y campos personalizados (fase 5), comentarios, checklist, historial, vencimientos |
| `gantt` | Vista Gantt (fase 3): qué tarjetas entran, dependencias entre tarjetas y reprogramación de sucesoras en días hábiles. Las vistas Lista y Calendario no necesitan app propia: leen las tarjetas de `tableros` |
| `exportacion` | Fase 4: exportar a Excel (.xlsx) y a MS Project (XML MSPDI) e importar desde ambos, con vista previa. Sin modelos propios: `services/datos.py` arma el contenido, `excel.py` y `mspdi.py` lo presentan o lo leen, `importacion.py` valida y crea |
| `plantillas` | Fase 5: tableros modelo (columnas + cards con duraciones relativas en días hábiles) para crear un tablero nuevo con un clic, y guardar un tablero existente como plantilla |

Organización interna de cada app (guía de estilo de HackSoft adaptada a las
recomendaciones de Django; ver la auditoría en §3.3):

```
<app>/
  models.py      datos + reglas de UNA instancia (métodos) + consultas
                 reutilizables en QuerySet propios (`Card.objects.activas()`,
                 `Tablero.objects.visibles_para(u)`)
  permisos.py    quién puede qué (funciones puras, sin HTTP)
  services/      operaciones con efectos: una transacción que deja todo
                 consistente (cambio + historial + avisos). Argumentos por
                 nombre; lanzan `core.errores.*`
  api/           serializers.py (formato de entrada/salida), views.py o
                 views/<recurso>.py (delgadas: permiso → servicio →
                 serializer), urls.py
  tests/         base.py (escenario común) + test_<funcionalidad>.py
```

- Las **vistas no contienen reglas**: validan formato y permisos y llaman a un
  servicio. Los **serializers no escriben**.
- Las **lecturas** van en `QuerySet` encadenables, no en una capa aparte de
  "selectors": el ORM de Django ya es esa capa.
- Los **errores de dominio** (`ReglaDeNegocio`, `ConflictoDeVersion`,
  `ServicioNoDisponible`) no saben de HTTP; `core.errores.manejador_excepciones`
  (registrado en `REST_FRAMEWORK`) los traduce a 400 / 503 (el 409 lo arma la
  vista con el estado actual), y también el `ValidationError` de Django.
- **Señales solo donde un cambio puede llegar por varios caminos** (hoy:
  invalidar la caché de feriados, que también se editan desde el admin). El
  resto son llamadas explícitas.

Reglas transversales:

- **Toda regla de negocio vive en el backend** (permisos, columna final,
  vencimientos, inclusión en Gantt). El frontend nunca decide si algo está
  permitido: solo lo refleja.
- Tablas de negocio con prefijo `planificacion_` (`Meta.db_table`), por
  coherencia con la Suite aunque la BD sea propia.
- FK a personas siempre contra `settings.AUTH_USER_MODEL` (la cuenta espejo);
  la traducción a `portal_user_id` pasa solo por `integracion_portal`.
- **Concurrencia optimista:** cada card y columna tiene un número de `version`;
  una edición con versión vieja responde **409** y el frontend ofrece recargar.
- **Nada se borra físicamente** en la operación normal: cards, columnas y
  tableros se **archivan**. El borrado definitivo es una acción aparte y
  explícita.

### 3.2 Frontend (React)

- **Rutas** (todas deep-linkeables, también dentro del iframe del Portal):
  - `/` → redirige a *Mis tareas*
  - `/mis-tareas`
  - `/tableros` (listado: personal + equipos)
  - `/tableros/:id` + `?vista=tablero|lista|calendario|gantt`
  - `/tableros/:id/cards/:numero` (card abierta como modal sobre el tablero)
  - `/equipos`, `/equipos/:id`
- **Estado de servidor** con una librería de caché de peticiones (propuesta:
  TanStack Query) para actualizaciones optimistas y reintentos.
- **Arrastrar y soltar** accesible con teclado (propuesta: dnd-kit).
- **Gantt propio** (HTML + SVG, `components/gantt/`, sin librería externa):
  así usa el mismo estilo, los mismos datos en caché que el Kanban y el
  calendario laboral del backend. La geometría (rango, filas, rutas de
  flechas) es pura en `lib/gantt.ts`; las reglas (inclusión, dependencias,
  reprogramación en días hábiles) las decide el backend.
- **Diseño adaptable** desde la fase 1: el tablero debe usarse en el celular
  (columnas deslizables, card abierta a pantalla completa).
- El protocolo `paldaca-embed` (ya implementado en `src/embed/`) informa al
  Portal de cada navegación, así la URL del Portal refleja tablero y card.

### 3.3 Auditoría de organización (septiembre 2026)

Se revisó el backend contra la guía de estilo de HackSoft, la postura de
James Bennett (lógica en modelos, managers y querysets; sin capas de
servicio "enterprise") y la documentación de Django (aplicaciones, señales,
transacciones y pruebas). Hallazgos corregidos:

1. Orquestación (transacción, historial, avisos) dentro de las vistas → pasó a
   `services/`.
2. Consultas complejas repetidas en vistas → `QuerySet` propios.
3. Utilidades compartidas en el paquete de configuración → `core/`.
4. Dependencia circular `equipos` ↔ `tableros` (permisos y serializers) →
   `equipos/permisos.py`; el listado de tableros de un equipo lo sirve la API
   de `tableros`.
5. Pruebas nombradas por fase → por funcionalidad, con escenarios en
   `tests/base.py`.
6. Nada garantizaba en la BD que `fecha_fin ≥ fecha_inicio` →
   `CheckConstraint` y `Card.clean()` (el Gantt depende de ello).
7. El manejador de errores ignoraba el `ValidationError` de Django → ahora
   responde 400.

Se mantuvo a propósito: un solo `settings.py` (el módulo es pequeño; el Portal
sí los separa), el nombre del paquete `Planificacion` (renombrarlo toca los
scripts de arranque y la guía de satélites) y una `APIView` por recurso en
lugar de una por operación.

---

## 4. Modelo de datos (conceptual)

> Nombres orientativos; los tipos exactos se fijan al implementar cada fase.

**Equipo** — `nombre`, `descripcion`, `color`, `creado_por`, `archivado`.

**MiembroEquipo** — `equipo`, `usuario`, `rol` (`administrador` | `miembro` |
`lector`), `agregado_por`, `agregado_en`. Único por (equipo, usuario). Solo se
crea al crear el equipo (quien lo crea) o al **aceptar una invitación**.

**InvitacionEquipo** — `equipo`, `invitado`, `invitado_por`, `rol`, `mensaje`
(opcional), `estado` (`pendiente` | `aceptada` | `rechazada` | `cancelada`),
`creada_en`, `respondida_en`. Una sola invitación **pendiente** por persona y
equipo; las respondidas quedan como historial y no impiden invitar de nuevo.

**Tablero** — `nombre`, `descripcion`, `tipo` (`personal` | `equipo`),
`propietario` (usuario, solo personal), `equipo` (solo de equipo),
`archivado`, `siguiente_numero_card`.
Reglas: sin equipo, el tablero es personal (cualquier usuario puede crearlo);
con equipo, solo lo crea un administrador de ese equipo. Un personal se
archiva si a su dueño le queda otro activo (nunca se queda sin ninguno). Una
tarjeta de un personal puede ir a otro personal propio o a uno de equipo; una
de equipo solo a otro de equipo (no se esconde en un tablero privado).

**Columna** — `tablero`, `nombre`, `orden`, `es_final` (sus cards cuentan como
terminadas), `incluir_en_gantt` (regla por defecto de sus cards),
`limite_cards` (opcional, fase 5), `archivada`, `version`.
Al crear un tablero: **Tareas**, **En curso**, **Hecho** (esta última con
`es_final = true`).

**Card** — `tablero`, `columna`, `numero` (correlativo por tablero: `#12`),
`titulo`, `descripcion`, `fecha_inicio`, `fecha_fin`, `urgencia`
(`baja` | `media` | `alta` | `critica`, por defecto `media`), `orden` (posición
dentro de la columna), `en_gantt` (`heredar` | `si` | `no`), `completada_en`
(se fija al entrar a una columna final), `creada_por`, `archivada`, `version`.
Validación: `fecha_fin >= fecha_inicio` cuando ambas existen.

**ResponsableCard** — `card`, `usuario`. Una card puede tener varios.

**Comentario** — `card`, `autor`, `texto`, `menciones` (usuarios),
`editado_en`, `eliminado` (borrado lógico: se muestra "comentario eliminado").

**Actividad** (historial) — `card`, `actor`, `accion` (creó, movió, editó,
asignó, quitó responsable, comentó, checklist, archivó, restauró, trasladó,
dependencia), `detalle` (antes/después), `creado_en`. Se genera
automáticamente; no se edita.

**Dependencia** (app `gantt`, fase 3) — `predecesora`, `sucesora`, `tipo`
(`fin_inicio` por defecto; `inicio_inicio`, `fin_fin`), `desfase_dias` (días
hábiles; negativo = solape), `creada_por`. Solo entre cards del mismo
tablero; el backend rechaza ciclos, repetidas y a sí misma; se pierden al
trasladar la card.

**ItemChecklist** (fase 2) — `card`, `texto`, `hecho`, `orden`.

**Feriado** (app `calendario`) — `fecha`, `nombre`, `recurrente` (se repite
cada año; se guarda con el año 2000). Días hábiles = lunes a viernes que no
son feriado. Los nacionales vienen sembrados; los **móviles** (Carnaval,
Jueves y Viernes Santo) no se guardan: se calculan desde la Pascua. Nivel de
instalación; por equipo, si algún día se pide.

**PlantillaTablero** (fase 5) — columnas y cards con duraciones relativas.

**Estado derivado (no se guarda):**
- *Vencimiento*: `vencida` si `fecha_fin < hoy` y la card no está en una
  columna final; `vence_pronto` si faltan ≤ 2 días hábiles.
- *Incluida en Gantt*: tiene ambas fechas **y** (`en_gantt = si`, o
  `en_gantt = heredar` y su columna tiene `incluir_en_gantt = true`).

---

## 5. Permisos

El acceso al **módulo** lo decide el Portal (`core_usuario_modulo`); el
middleware SSO ya responde 403 a quien no tiene `planificacion`. Dentro del
módulo:

| Acción | Tablero personal | Tablero de equipo |
|---|---|---|
| Ver | Solo el dueño | Miembros y lectores del equipo |
| Crear / editar / mover cards, comentar | Solo el dueño | Administradores y miembros |
| Crear, renombrar, reordenar o archivar columnas | Solo el dueño | Administradores del equipo |
| Crear o archivar tableros | — (el personal no se archiva) | Administradores del equipo |
| Gestionar miembros y roles | — | Administradores del equipo |

- **Crear equipos:** cualquier usuario con acceso al módulo; quien lo crea
  queda como administrador. Un equipo nunca puede quedar sin administrador.
- **Entrar a un equipo:** solo por invitación. Invitan los administradores
  del equipo; responde únicamente la persona invitada (aceptar la hace
  miembro con el rol de la invitación). El administrador puede cancelar una
  invitación pendiente. Salir es libre, salvo para el último administrador.
- **Administrador del módulo** (según el Portal): puede ver y administrar todos
  los equipos, para soporte y para recuperar equipos huérfanos.
- **Superusuario local:** solo para el Django admin (break-glass), nunca por
  espejo — ver `CONTRATO_SSO_FEDERADO.md` §5.
- **Mover una card** del tablero personal a uno de equipo: permitido si el
  usuario es miembro del equipo destino. Los comentarios y el historial viajan
  con la card.

---

## 6. Sincronización con el Portal

Esta sección es transversal: cada fase implementa la parte que le toca, pero
el diseño completo se fija aquí para no rehacer nada después.

### 6.1 Identidad y acceso (ya resuelto en el scaffold)

- `paldaca_sso` crea y actualiza la **cuenta espejo** del usuario a partir de
  `GET /api/auth/me/`. La clave de unión es `CuentaPortal.portal_user_id`.
- **Pérdida de acceso:** si el Portal le retira el módulo a alguien, sus
  membresías y responsabilidades **se conservan** (para no perder historia),
  pero en la UI aparece como *sin acceso* y no recibe notificaciones.
  `CuentaPortal.activo_en_portal` y la ausencia de `planificacion` en sus
  módulos son la fuente para mostrarlo.
- El nombre, email y disciplina se muestran **siempre desde la cuenta espejo**,
  nunca copiados a los modelos de negocio: así un cambio de nombre en el Portal
  aparece solo en el siguiente ingreso de esa persona.

### 6.2 Directorio de personas (agregar miembros)

Problema: el satélite solo conoce a una persona después de que esta entra al
módulo una vez. Para agregar a un compañero que nunca entró hace falta
preguntar al Portal.

- **Hecho (fase 1):** el Portal expone
  `GET /api/auth/directorio/modulos/<codigo>/personas/` (`?q=` o `?id=`), de
  **solo lectura**, para cualquier usuario con acceso a ese módulo. Devuelve
  solo cuentas activas con el módulo asignado explícitamente, sin
  superusuarios ni staff, en forma mínima. Cada módulo debe estar en
  `PALDACA_DIRECTORIO_LECTURA_MODULOS` (por defecto `planificacion`). El
  directorio de administradores (`/api/auth/directorio/*`) no se usa: además
  de buscar permite crear usuarios en el Portal.
- Planificación consulta ese endpoint con la cookie del Portal de quien opera
  (`integracion_portal/services/directorio.py`). Si el Portal no responde, el buscador
  cae a las cuentas que ya entraron al módulo y lo avisa.
- Al invitar a alguien que nunca entró, se **confirma con el Portal** (`?id=`)
  y solo entonces se crea su cuenta espejo (contraseña inutilizable, nunca
  superusuario, revisión vacía para que su primer ingreso sincronice todo).
  Nunca con datos enviados por el navegador.

### 6.3 Notificaciones

Emisión con el mecanismo estándar de la Suite (anexo de la guía de
integración): `POST {PALDACA_PORTAL_API_URL}/api/notificaciones/eventos/`
con **firma de servicio** (`X-Paldaca-Client: planificacion`,
`X-Paldaca-Timestamp`, `X-Paldaca-Signature`).

La firma usa un **secreto propio del módulo**, nunca `DJANGO_SECRET_KEY`
(la del satélite es propia y el Portal no la conoce, R-02):
`PALDACA_NOTIF_SECRET` en Planificación = `PALDACA_NOTIF_SECRET_PLANIFICACION`
en el Portal (≥ 32 caracteres). En local lo genera y sincroniza
`iniciar.ps1` (`scripts/modulos.py`); en producción se configura a mano en
los dos despliegues y conviene añadir `planificacion` a
`PALDACA_NOTIF_ESTRICTO` del Portal. La cookie del operador no sirve aquí:
el Portal solo la acepta de administradores del módulo, y en Planificación
invita cualquier administrador de equipo.

Catálogo propuesto (se crea con **una migración en el Portal**, nunca desde el
satélite):

| Código | Audiencia | Cuándo | Fase |
|---|---|---|---|
| `planificacion.invitacion_equipo` | `payload.usuario_ids` | Te invitan a un equipo (se resuelve al aceptar, rechazar o cancelar) | **1 (hecho)** |
| `planificacion.invitacion_respondida` | `payload.usuario_ids` | Quien invitó se entera de que aceptaron o rechazaron | **2 (hecho)** |
| `planificacion.card_asignada` | `payload.usuario_ids` | Alguien te agrega como responsable | **2 (hecho)** |
| `planificacion.mencion` | `payload.usuario_ids` | Te mencionan con @ en un comentario | **2 (hecho)** |
| `planificacion.comentario_nuevo` | `payload.usuario_ids` | Comentan en una card donde eres responsable (si además te mencionan, solo llega la mención) | **2 (hecho)** |
| `planificacion.card_por_vencer` | `payload.usuario_ids` | Tu card vence en ≤ `umbral_dias` días hábiles (2 por defecto, editable en el Portal) | **2 (hecho)** |
| `planificacion.card_vencida` | `payload.usuario_ids` | Tu card venció y no está terminada | **2 (hecho)** |

Reglas:

- `usuario_ids` son **ids del Portal**: se traducen con `CuentaPortal` al
  emitir. Personas sin cuenta espejo o sin acceso al módulo se omiten.
- **Nunca se notifica al actor** (si me asigno una card, no me llega aviso).
- Todo evento trae `payload.url` con el **deep link del Portal**:
  `{PALDACA_PORTAL_URL}/planificacion/tableros/<id>/cards/<numero>`. Al hacer
  clic en la campana se abre la card dentro del Portal.
- Vencimientos: una **tarea programada diaria** (comando de Django ejecutado
  por un cron del servidor/Coolify) emite `card_por_vencer` y `card_vencida`
  con `clave_agrupacion = card-<id>` para no repetir avisos. Cuando la card
  pasa a una columna final o cambia su fecha, se llama a
  `POST /api/notificaciones/eventos/resolver/` con esa misma clave.
- **Entrega fiable** (`integracion_portal.AvisoSaliente`): cada aviso se
  guarda en la misma transacción que el cambio y se envía después del commit,
  fuera de la petición. Si el Portal no responde (red, 5xx, credenciales) queda
  pendiente y se reintenta con espera creciente (1, 2, 4… min, hasta 6 h, 10
  intentos); un 400/404 se descarta. Los avisos de la misma `clave_agrupacion`
  salen en orden. Nunca se revierte el cambio local.
- **Vencimientos por transición**: se avisa una vez al pasar a «por vencer» y
  otra al pasar a «vencida» (reemitir con la misma clave marcaría el aviso
  como no leído cada día). Terminar, archivar o mover la fecha resuelve el
  aviso al instante. La tarjeta muestra «vence pronto» con el mismo umbral que
  usa el aviso (leído del Portal, caché de 10 min).
- **Tareas programadas** (Scheduled Tasks de Coolify; en local las corre el
  arranque de la Suite):
  - `python manage.py procesar_avisos` — cada 5 minutos.
  - `python manage.py revisar_vencimientos` — una vez al día, temprano.
- Nunca datos sensibles en `titulo`/`cuerpo`: basta el título de la card y el
  nombre del tablero.

### 6.4 Embed y navegación del Portal

- Ruta del shell: `PALDACA_SHELL_PATH=/planificacion` (ya configurado).
- Menú del módulo en el Portal (`navigationConfig.ts`): Mis tareas,
  Tableros, Equipos e Invitaciones; accesos rápidos del Home en
  `quick-actions.ts`.
- Cada cambio de ruta de la SPA emite `navigate` por el protocolo
  `paldaca-embed`, de modo que la URL del Portal siempre es compartible.
- Las vistas Lista, Calendario y Gantt viajan en `?vista=` y el Portal la
  conserva en su URL y en los enlaces profundos al iframe.
- **Icono del módulo:** `chartGantt` (barras de Gantt) en el Portal, el menú
  de la Suite, el favicon y la marca del satélite.
- **Abierta suelta** (su subdominio) monta `paldaca-nav`, la misma barra de la
  Suite (sidebar, campana de avisos, perfil y cambio de app) que usan los
  demás satélites (`frontend/src/embed/usePaldacaNav.ts`). Sus enlaces a rutas
  de la SPA navegan sin recargar y el widget marca el ítem activo con el
  evento `paldaca-nav:ubicacion`. Si el Portal no responde en 8 s, se pinta un
  menú propio de respaldo. Variables: `VITE_PALDACA_NAV_URL` (dónde publica el
  Portal `paldaca-nav.js`) y `VITE_PALDACA_PORTAL_API_URL`.
- Los menús se editan **solo** en el Portal (`navigationConfig.ts`): el
  satélite no repite ítems.
- En producción, `planificacion` entra en `VITE_EMBEDDED_MODULES` solo tras
  desplegar `planificacion.cpaldaca.com` con `PALDACA_SSO_ENABLED=true` y
  `PALDACA_FRAME_ANCESTORS` configurado.

### 6.5 Sesión y actualización de datos

- Riesgo R-07 del contrato federado: un temporizador de fondo que llame al
  backend mantiene viva la sesión del Portal sin nadie delante. Por eso la
  actualización automática del tablero:
  - ocurre al **volver a la pestaña** y cada pocos segundos **solo mientras la
    pestaña está visible** y hubo actividad reciente del usuario;
  - se **detiene** tras un periodo de inactividad (propuesta: 10 minutos).
- El tiempo real verdadero (websockets) queda para la fase 5 y debe respetar
  la misma regla.

### 6.6 Estado del módulo

El Portal publica el estado de cada módulo (`/api/notificaciones/estado-modulos/`,
lo cambian los superadmins) y **su shell ya lo muestra** alrededor del iframe
(`ModuleFrame.tsx`). Embebido, Planificación no tiene que hacer nada.

Solo al usarse **suelto en su subdominio** haría falta mostrarlo. Si se pide,
el backend lo consulta reenviando la cookie del Portal (igual que `me/`; el
endpoint admite a cualquier usuario con acceso al módulo) y la SPA muestra un
aviso. Queda como opcional de la fase 2.

---

## 7. Plan por fases

Cada fase termina con algo **usable en producción**. El alcance de una fase no
crece a mitad de camino: lo nuevo va a la siguiente.

### Estado del plan

| Fase | Estado | Commits (repo Planificación, rama `dev`) |
|---|---|---|
| 0 — Cimientos | ✅ hecha; queda la BD MySQL propia antes de datos reales (D-06) | `4e9ef6b` |
| 1 — Tableros y cards | ✅ implementada | `6d7034c`, `6f8f9fa`, `d7de71c` |
| 2 — Colaboración y avisos | ✅ implementada; §6.6 (estado del módulo suelto) sigue opcional | `6aa1a61` |
| 3 — Gantt y vistas | ✅ implementada y auditada | `644c063`, `594fde4` |
| 4 — Exportación e importación | ✅ implementada; falta abrir el XML en un MS Project real (aquí no hay Project) | `6e9157a`, `e81f239` |
| 5 — Flexibilidad avanzada | ✅ implementada en el alcance elegido: plantillas, etiquetas, campos personalizados y límite por columna. El resto de candidatos sigue propuesto | ver `git log` |

**Hecho fuera de las fases** (mejoras pedidas por el camino):
- **Reorganización del backend** por capas (`services/`, `api/`, QuerySet
  propios) tras auditar contra las buenas prácticas de Django (§3.3) —
  `4b45e36`.
- **App `calendario`** (días hábiles y feriados) adelantada de la fase 3 —
  `4b45e36`.
- **Varios tableros personales:** al crear un tablero el equipo es
  opcional; sin equipo es personal. Personales archivables (si queda otro
  activo) y restaurables desde *Tableros* — `e8d521c`.
- **Barra de la Suite:** abierta suelta, Planificación monta `paldaca-nav`
  del Portal (menú propio solo de respaldo); icono del módulo = Gantt (§6.4) —
  `594fde4` y Portal `d27c0de`.
- **Gantt adaptable** al espacio de la ventana — `594fde4`.
- Correcciones: `frontend/src/lib/` no se versionaba por un patrón del
  `.gitignore` (`c116d13`); la lista de *Archivadas* mostraba la caché vacía
  al reabrirla (`e8d521c`).

**Pendiente transversal:** MySQL propia (D-06); estado del módulo abierto
suelto (§6.6, opcional); prueba con sesión real del Portal (solo se probó con
un usuario de demostración).

### Fase 0 — Cimientos (ya hecho, ajustes menores)

**Hecho:** scaffold federado (SSO, embed, cuenta espejo, `me/`), SPA con
pantallas de estado, arranque desde `iniciar.ps1 -Modo planificacion`,
registro del módulo en el Portal.

**Resuelto después:** layout base (hoy la barra es `paldaca-nav`, §6.4);
convenciones de API (`/api/v1/`, `{"detail"}` en errores de negocio, 409 por
versión, permisos por objeto en `permisos.py`).

**Pendiente:** migración a **MySQL propia** (nunca la instancia del Portal)
antes de cargar datos reales (D-06).

### Fase 1 — Tableros y cards (primera versión útil) — ✅ implementada

**Objetivo:** que un equipo pueda organizar su trabajo en un tablero y
comentar las cards, dentro del Portal.

Alcance:
- **Equipos:** crear, editar, archivar; roles administrador / miembro /
  lector; salir del equipo.
- **Invitaciones:** invitar a cualquier persona del Portal con el módulo (§6.2) con
  rol y mensaje; aviso `planificacion.invitacion_equipo` en la campana del
  Portal; aceptar / rechazar desde *Invitaciones*; cancelar; el aviso se
  resuelve al responder.
- **Tablero personal** automático en el primer ingreso (después se
  permitieron varios, ver «Estado del plan»).
- **Tableros de equipo:** varios por equipo; crear, renombrar, archivar.
- **Columnas:** Tareas / En curso / Hecho al crear; agregar, renombrar,
  reordenar, archivar; marcar cuál es la columna final. Archivar una columna
  con cards exige elegir a qué columna mover esas cards.
- **Cards:** crear rápido (título + Enter), editar título, descripción, fechas,
  urgencia y responsables; mover entre columnas y reordenar arrastrando;
  archivar y restaurar.
- **Card abierta** (botón *Abrir tarjeta*): todos los campos editables y el
  hilo de **comentarios** (crear, editar y borrar los propios).
- **Vencimiento** visible en la card (vence pronto / vencida).
- **Filtros** del tablero: urgencia, responsable, vencidas, texto.
- **Mis tareas:** cards donde soy responsable, de todos mis tableros,
  agrupadas en *Vencidas / Esta semana / Más adelante / Sin fecha*.
- **Portal:** ítems de menú del módulo, accesos rápidos, tipo de aviso de
  invitación (migración `notificaciones/0016`) y secreto de avisos en el
  arranque local.

Implementación: apps `equipos`, `tableros` e `integracion_portal` (41 tests);
SPA con Tailwind y los tokens visuales del Portal, dnd-kit para arrastrar,
TanStack Query (optimista, PATCH en serie por tarjeta) y Motion para las
animaciones.

Criterios de aceptación:
- Dos miembros del mismo equipo ven y editan el mismo tablero; un tercero
  que no es miembro recibe 403 al abrir su URL.
- Una edición simultánea sobre la misma card nunca pisa cambios en silencio
  (409 + aviso).
- Mover una card a *Hecho* fija `completada_en`; sacarla lo limpia.
- Todo funciona embebido en el Portal y en un celular.
- Tests de permisos para cada fila de la tabla de §5.

Fuera de alcance: notificaciones, Gantt, exportaciones, checklist, adjuntos.

### Fase 2 — Colaboración y notificaciones — ✅ implementada

**Objetivo:** que el trabajo avise solo y que agregar personas no dependa de
que hayan entrado antes.

Alcance:
- **Portal:** migración con los tipos `planificacion.*` restantes (§6.3).
- **Satélite:** emisión de asignación, mención y comentario nuevo (el cliente
  firmado ya existe desde la fase 1).
- **Menciones** con `@` en comentarios (autocompletado entre miembros).
- **Tarea programada diaria** de vencimientos (por vencer / vencida).
- **Historial** de la card y del tablero (pestaña *Actividad* en la card
  abierta).
- **Checklist** dentro de la card, con progreso visible en el tablero.
- **Actualización automática** según §6.5.
- **Mover card** del tablero personal a uno de equipo (y, con varios
  personales, entre personales propios).
- (Opcional, **pendiente**) Aviso de **estado del módulo** fuera del Portal (§6.6).

Criterios de aceptación:
- Asignar a alguien genera exactamente una notificación, a esa persona, con
  enlace que abre la card dentro del Portal.
- Terminar una card vencida resuelve su aviso en la campana.
- Si el Portal está caído, guardar una card funciona igual y el fallo queda
  registrado.
- El vector de prueba de la firma (anexo de la guía) da el valor esperado.

### Fase 3 — Gantt y vistas — ✅ implementada

**Objetivo:** ver el mismo tablero como línea de tiempo, calendario o lista.

Alcance:
- **Selector de vista** en cada tablero: Tablero · Lista · Calendario · Gantt
  (se recuerda la última por usuario y tablero).
- **Reglas de inclusión en el Gantt:**
  1. solo cards con inicio y fin;
  2. por columna (`incluir_en_gantt`);
  3. por card (`en_gantt`: heredar / sí / no).
- **Bandeja "Sin fechas"** junto al Gantt: arrastrar una card a la línea de
  tiempo le asigna fechas.
- **Edición desde el Gantt:** mover una barra cambia las fechas; estirarla
  cambia la fecha final (todo pasa por la misma API y los mismos permisos).
- **Dependencias** entre cards (flechas), con validación de ciclos; opción de
  mover automáticamente las sucesoras cuando se retrasa una predecesora.
- **Agrupar filas** por columna, responsable o urgencia; zoom día / semana /
  mes; línea de hoy.
- **Calendario laboral** (días hábiles y feriados) para duraciones y
  vencimientos.
- **Vista Lista** (tabla ordenable) y **vista Calendario** (mensual/semanal).
- ~~Prueba técnica para elegir librería~~: se hizo un Gantt propio (ver §3.2).

Cómo quedó:
- `?vista=tablero|lista|calendario|gantt` en la URL (enlazable, el Portal la
  refleja); si no viene, la última usada en ese tablero. La tarjeta abierta
  conserva la vista al cerrarse. Los filtros aplican a las cuatro vistas.
- **Lista:** tabla ordenable por cualquier columna (las fechas vacías siempre
  al final).
- **Calendario:** cuadrícula mensual lunes→domingo, tarjetas como barras que
  cruzan semanas, feriados y fines de semana sombreados, «+N más» por día y
  arrastrar para cambiar la fecha (conserva la duración).
- **Gantt:** agrupar por columna, responsable o urgencia (plegables); zoom
  día / semana / mes; línea de hoy; mover y estirar barras; bandeja «Sin
  fechas»; flechas de dependencia (se crean arrastrando desde el punto al
  final de una barra; clic en una flecha para cambiar tipo, desfase o
  quitarla); las incumplidas en rojo punteado; interruptor «Mover
  sucesoras».
- **Dependencias** (`gantt.Dependencia`): fin→inicio, inicio→inicio y
  fin→fin, desfase en días hábiles (negativo = solape); sin ciclos ni entre
  tableros; al trasladar una tarjeta se pierden (señal `tarjeta_trasladada`,
  así `tableros` no depende de `gantt`). Empezar en un día no hábil cuenta
  como empezar el siguiente hábil.
- **Reprogramar** (`cards/:id/programar/`): solo empuja hacia adelante,
  conserva la duración hábil de cada sucesora, no toca tarjetas terminadas ni
  sin fechas, y cada cambio pasa por la misma edición que una a mano
  (historial, avisos, vencimientos).
- **Calendario laboral** (`calendario`): feriados nacionales sembrados,
  móviles calculados desde la Pascua (Carnaval, Jueves y Viernes Santo) y
  puntuales o recurrentes que agrega el administrador del módulo.
- Columna: «Incluir en el Gantt / Sacar del Gantt» en su menú. Tarjeta:
  «Gantt: Según columna / Sí / No» y la lista de dependencias.

Criterios de aceptación:
- Un cambio hecho en el Gantt se ve de inmediato en el Tablero y viceversa.
- Cambiar `incluir_en_gantt` de una columna actualiza el Gantt sin tocar las
  cards.
- Una dependencia circular se rechaza con un mensaje claro.

### Fase 4 — Exportación e importación — ✅ implementada

**Objetivo:** llevar el plan a las herramientas que ya usa la empresa.

Alcance:
- **Excel (.xlsx):** hoja de cards (número, título, columna, urgencia,
  responsables, inicio, fin, vencimiento, avance del checklist) y hoja
  *Gantt* dibujada con celdas coloreadas. Respeta los filtros activos.
- **MS Project:** exportación a **XML de Project (MSPDI)**, que Project abre
  directamente. Mapeo: grupo del Gantt → tarea resumen; card → tarea;
  dependencias → vínculos con su tipo y desfase; responsables → recursos.
  (El formato nativo `.mpp` es cerrado; no se genera.)
- **Importación** desde Excel (plantilla descargable) y desde XML de Project,
  con vista previa antes de crear las cards.
- Generación en el backend; para archivos grandes, descarga cuando está listo.

Criterios de aceptación:
- Un tablero exportado a XML e importado de nuevo conserva cards, fechas y
  dependencias. ✅ (prueba automática; también por Excel)
- El XML abre en MS Project sin advertencias. ⏳ El XML sigue el orden del
  esquema MSPDI; falta abrirlo en un MS Project real.

Cómo quedó:
- **Menú «Excel / Project»** en la cabecera del tablero: exportar a Excel,
  exportar a MS Project e *Importar tarjetas…* (quien puede editar). Con
  filtros activos se exporta solo lo filtrado y el Excel lo anota.
- **Excel, hoja Tarjetas:** bloque de identificación (tablero, fecha,
  resumen, filtros), fechas y números reales con formato, bordes, filas
  alternadas, autofiltro y «#»/«Título» fijos, mismo criterio que el
  desglose de Nómina (`Reportes/services/desglose_excel.py`). Sus columnas
  son las de la plantilla, así que **un Excel exportado se vuelve a importar**
  tal cual. Dependencias en texto estilo Project: `3`, `3CC+2`, `3FF-1`.
- **Excel, hoja Gantt:** una columna por día (por semana si el rango pasa de
  un año), días pintados del color de la urgencia (verde si terminada),
  fines de semana y feriados atenuados.
- **MS Project (MSPDI):** tablero = proyecto, columnas = tareas resumen,
  tarjetas del Gantt = tareas **programadas manualmente** (Project respeta
  las fechas), calendario con los feriados como excepciones, vínculos con
  tipo y desfase, responsables = recursos, urgencia = prioridad, avance =
  checklist, descripción = notas.
- **Importar:** plantilla descargable (listas de columnas y urgencias, hoja
  de instrucciones); vista previa sin guardar nada con **errores** (la fila
  no entra) y **avisos** (entra con un ajuste: columna desconocida, persona
  que no está en el tablero, vínculo a una fila que no se importa); al
  confirmar, todo en una transacción. Desde Project: la columna sale de la
  tarea resumen y una tarea al 100 % va a la columna final. Los responsables
  reciben **un** aviso agrupado, no uno por tarjeta. Límites: 5 MB y 1000
  filas.
- Generación síncrona: un tablero tiene decenas o cientos de tarjetas y el
  archivo se arma en milisegundos; la «descarga cuando está listo» queda para
  cuando haga falta (D-11).

### Fase 5 — Flexibilidad avanzada — ✅ implementada (alcance elegido)

Se prioriza con lo aprendido en las fases anteriores. Candidatos (✅ = hecho
en esta fase):

- ✅ **Plantillas de tablero:** crear un tablero desde una plantilla (columnas
  y cards con duraciones relativas) y **guardar un tablero como plantilla**.
- **Adjuntos** en las cards (requiere almacenamiento de archivos y límites).
- ✅ **Campos personalizados** por tablero (texto, número, lista).
- ✅ **Etiquetas** por tablero (por ejemplo, disciplina o cliente).
- ✅ **Límite de cards por columna** (estilo Kanban).
- **Tiempo real** con websockets, respetando §6.5.
- **Métricas:** cards terminadas por semana, vencidas por equipo.
- **Vínculo con Hoja de Tiempo** (cargar horas contra una card), si el negocio
  lo pide.

Cómo quedó:
- **Etiquetas** por tablero (nombre + color, máx. 30): se crean, renombran,
  recolorean y borran en *«…» → Etiquetas y campos…* (quien gestiona el
  tablero); se marcan con un clic en la tarjeta, se ven como píldoras en el
  Kanban y la Lista, filtran el tablero (y la exportación) y quedan en el
  historial («puso la etiqueta «Cliente»»).
- **Campos personalizados** (texto, número, lista; máx. 20 activos): valores
  en la tarjeta, columna propia en la Lista (ordenable), visibles en el Kanban
  si se marca «En la tarjeta». No se borran: se archivan y conservan sus
  valores (D-14). Números aceptan coma o punto.
- **Límite por columna** (1–999, en el menú de la columna): contador `n/límite`
  ámbar al llegar y rojo al pasarse, y un aviso al sumar una tarjeta de más;
  no bloquea (D-13).
- **Plantillas** (app `plantillas`): *«…» → Guardar como plantilla…* (solo
  para mí, para el equipo si lo administro, o para todo el módulo si soy su
  administrador); botón *Plantillas* en Tableros para usarlas, renombrarlas o
  borrarlas; y el selector *Empezar con* al crear un tablero, con fecha de
  inicio. Las fechas viajan en días hábiles relativos y se recalculan con el
  calendario laboral (D-15). No viajan personas, comentarios ni historial.
- **Excel:** columnas *Etiquetas* y una por campo, importables (la plantilla
  de importación trae listas desplegables para los campos de tipo lista).
  El XML de Project no lleva etiquetas ni campos.
- Al **trasladar** una tarjeta se conservan las etiquetas y campos que existan
  con el mismo nombre en el tablero destino.

---

## 8. API (resumen)

Todos bajo `/api/v1/`, sesión local resuelta por `paldaca_sso`, CSRF por
cabecera `X-CSRFToken`.

| Recurso | Operaciones |
|---|---|
| `equipos/` | listar (los míos), crear, ver, editar, archivar |
| `equipos/:id/miembros/` | listar, cambiar rol, quitar |
| `equipos/:id/invitaciones/` | listar pendientes, invitar (admin del equipo) |
| `invitaciones/` | mis invitaciones pendientes |
| `invitaciones/:id/aceptar/` · `rechazar/` · `cancelar/` | responder (invitado) o cancelar (admin) |
| `equipos/:id/salir/` | salir del equipo |
| `personas/?q=` | buscador de personas (§6.2) |
| `tableros/` | listar (personales + de mis equipos; `?archivados=personales`), crear (sin `equipo` = personal), ver, editar, archivar / restaurar |
| `equipos/:id/tableros/` | tableros del equipo (con archivados para su admin) |
| `tableros/:id/columnas/` | crear, editar, reordenar, archivar (con destino de cards) |
| `tableros/:id/cards/` | listar (con filtros), crear |
| `cards/:id/` | ver, editar (con `version`), mover (columna + posición), archivar |
| `cards/:id/comentarios/` | listar, crear, editar, borrar |
| `cards/:id/actividad/` | historial de la card |
| `cards/:id/checklist/` · `checklist/:id/` | añadir · marcar, renombrar, eliminar |
| `cards/:id/trasladar/` | llevar la card a otro tablero (de personal: a personal propio o equipo; de equipo: solo a equipo) |
| `tableros/:id/archivadas/` | cards archivadas del tablero |
| `mis-tareas/` | cards donde soy responsable |
| `tableros/:id/dependencias/` · `dependencias/:id/` | listar (con `incumplida`), crear · cambiar tipo o desfase, quitar |
| `cards/:id/programar/` | nuevas fechas y, con `mover_sucesoras`, empujar la cadena (devuelve las tarjetas cambiadas) |
| `calendario/feriados/?desde&hasta` · `calendario/feriados/:id/` | feriados del rango (fijos, puntuales y móviles) · alta y baja (admin del módulo) |
| `tableros/:id/exportar/?formato=xlsx|xml` | descarga (con los filtros del tablero: `q`, `urgencia`, `responsable`, `etiqueta`, `vencidas`) |
| `tableros/:id/importar/` · `importar/plantilla/` | multipart `archivo` (.xlsx o .xml): vista previa; con `confirmar=true`, crea · plantilla Excel |
| `tableros/:id/etiquetas/` · `etiquetas/:id/` | crear · editar, borrar (quien gestiona el tablero) |
| `tableros/:id/campos/` · `campos/:id/` | crear · editar (nombre, opciones, visible, archivar; el tipo no cambia) |
| `plantillas/` · `plantillas/:id/` | listar las visibles, guardar un tablero como plantilla · ver, renombrar, borrar |
| `plantillas/:id/usar/` | crear un tablero desde la plantilla (`nombre`, `equipo`, `fecha_inicio`) |

---

## 9. Decisiones abiertas

| # | Decisión | Propuesta |
|---|---|---|
| D-01 | ¿Fechas con hora o solo día? | Solo día en fases 1–4 |
| D-02 | ¿Quién crea equipos? | Cualquier usuario con acceso al módulo (**decidido**) |
| D-08 | ¿Cómo se entra a un equipo? | Solo por invitación aceptada (**decidido**) |
| D-03 | Umbral de "vence pronto" | 2 días hábiles; lo ajusta el Portal en el tipo de aviso `card_por_vencer` (**decidido**) |
| D-04 | ¿Comentarios en el tablero personal? | Sí, como notas propias (nadie más los ve) |
| D-05 | Librería de Gantt | Gantt propio en HTML + SVG, sin librería (**decidido**, §3.2) |
| D-06 | Motor de BD en producción | MySQL propia antes de la fase 1 en producción |
| D-07 | ¿El admin del módulo ve tableros personales? | No: el tablero personal es privado para todos (**decidido**) |
| D-09 | ¿Uno o varios tableros personales? | Varios; el equipo es opcional al crear (**decidido**) |
| D-10 | Menú al abrir la app suelta | `paldaca-nav` del Portal; el propio solo de respaldo (**decidido**) |
| D-11 | ¿Exportación en segundo plano? | No por ahora: síncrona (tableros de cientos de tarjetas); revisar si un tablero pasa de ~5000 (**decidido**) |
| D-12 | Tareas en MS Project | Programadas manualmente, para conservar las fechas del tablero (**decidido**) |
| D-13 | ¿El límite por columna bloquea? | No: es suave, marca y avisa; el trabajo real no se frena por una regla del tablero (**decidido**) |
| D-14 | ¿Dónde viven los valores de campos personalizados? | En `Card.campos` (JSON por id de campo), validados en el servicio; los campos se archivan, no se borran (**decidido**) |
| D-15 | ¿Qué guarda una plantilla? | Una foto JSON con fechas relativas en días hábiles, etiquetas y campos por nombre; sin personas, comentarios ni historial (**decidido**) |

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Crecer sin control (intentar clonar Trello completo) | Alcance cerrado por fase; lo nuevo va a la fase siguiente |
| La flexibilidad complica la interfaz | Buenos predeterminados; configuración avanzada escondida hasta que se pida |
| Sesión del Portal mantenida viva por la actualización automática (R-07) | Reglas de §6.5 |
| Notificaciones duplicadas o ruidosas | `clave_agrupacion`, no notificar al actor, resolver al terminar |
| Pérdida de datos por ediciones simultáneas | Versión por objeto y 409 |
| Personas que pierden acceso quedan "colgadas" | Se conservan y se muestran como *sin acceso* (§6.1) |
| SQLite en producción | Migrar a MySQL propia antes de datos reales (D-06) |
| Exportación a Project incompleta | Basarse en MSPDI y probar ida y vuelta (criterio de la fase 4) |
