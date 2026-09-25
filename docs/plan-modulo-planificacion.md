# Plan del módulo Planificación — diseño por fases

> Estado: **fase 1 implementada** (tableros, cards, comentarios, equipos con invitación).
> Fases 2–5: propuesta.
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
| **Tablero personal** | Tablero privado de un usuario. Hay exactamente uno por usuario; se crea solo en su primer ingreso. |
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
                 │  Directorio de personas (fase 2)                 │
                 └──────────────────────────────────────────────────┘

Planificación
  backend/   Django + DRF — API REST, reglas de negocio, cálculo del Gantt,
             exportaciones, emisión de notificaciones, tareas programadas
  frontend/  React SPA — vistas, arrastrar y soltar, estado de servidor
  BD propia  (SQLite en desarrollo; MySQL propia antes de producción)
```

### 3.1 Backend (Django)

Apps nuevas, además de `core` y `paldaca_sso` que ya existen:

| App | Responsabilidad |
|---|---|
| `equipos` | Equipos y membresías con roles |
| `tableros` | Tableros, columnas, cards, responsables, comentarios, historial |
| `vistas` | Cálculos para Gantt y Calendario (inclusión, agrupación, días hábiles) |
| `exportacion` | Generación de Excel y XML de MS Project (e importación, fase 4) |
| `integracion_portal` | Cliente de notificaciones firmado, directorio de personas, traducción usuario local ↔ `portal_user_id` |

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
- **Gantt:** librería a decidir con una prueba de 2–3 días en la fase 3
  (candidata principal: SVAR React Gantt, licencia MIT; alternativa: Gantt
  propio en SVG). El cálculo de fechas y agrupaciones lo hace el backend, así
  que la librería solo dibuja y es reemplazable.
- **Diseño adaptable** desde la fase 1: el tablero debe usarse en el celular
  (columnas deslizables, card abierta a pantalla completa).
- El protocolo `paldaca-embed` (ya implementado en `src/embed/`) informa al
  Portal de cada navegación, así la URL del Portal refleja tablero y card.

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
Restricción: un único tablero `personal` activo por usuario.

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

**Actividad** (historial) — `card` o `tablero`, `actor`, `accion` (creó,
movió, cambió fecha, asignó, comentó…), `detalle` (antes/después), `fecha`.
Se genera automáticamente; no se edita.

**DependenciaCard** (fase 3) — `predecesora`, `sucesora`, `tipo`
(fin→inicio por defecto; inicio→inicio, fin→fin), `desfase_dias`.
Solo entre cards del mismo tablero; el backend rechaza ciclos.

**ItemChecklist** (fase 2) — `card`, `texto`, `hecho`, `orden`.

**CalendarioLaboral** (fase 3) — días hábiles de la semana y **Feriado**
(`fecha`, `nombre`), a nivel de instalación y, más adelante, por equipo.

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

- **Fase 1 (sin cambios en el Portal):** el buscador de invitados ofrece solo
  personas que ya entraron alguna vez a Planificación. La UI lo explica
  ("¿No aparece? Pídele que entre una vez a Planificación").
- **Fase 2 (cambio acotado en el Portal):** un endpoint de **solo lectura**
  para buscar usuarios **con acceso a un módulo** dado, accesible a cualquier
  usuario de ese módulo (no solo a sus administradores). El directorio actual
  (`/api/auth/directorio/*`, `PALDACA_DIRECTORIO_MODULOS`) **no sirve tal
  cual**: está limitado a administradores y además permite crear usuarios en
  el Portal, un poder que Planificación no necesita ni debe tener.
  - Al elegir a alguien del resultado, Planificación crea su cuenta espejo
    **por adelantado** (sin contraseña utilizable, igual que en el SSO) usando
    el mismo mapeo de `paldaca_sso/identity.py`, porque el endpoint devuelve la
    misma forma que `/api/auth/me/`.

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
| `planificacion.card_asignada` | `payload.usuario_ids` | Alguien te agrega como responsable | 2 |
| `planificacion.mencion` | `payload.usuario_ids` | Te mencionan con @ en un comentario | 2 |
| `planificacion.comentario_nuevo` | `payload.usuario_ids` | Comentan en una card donde eres responsable | 2 |
| `planificacion.card_por_vencer` | `payload.usuario_ids` | Tu card vence en ≤ 2 días hábiles | 2 |
| `planificacion.card_vencida` | `payload.usuario_ids` | Tu card venció y no está terminada | 2 |

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
- Emisión **asíncrona respecto del guardado**: si el Portal no responde, se
  registra el fallo y **no se revierte** el cambio local. (Fase 2: envío
  después del commit de la transacción; si el volumen lo pide, cola simple en
  BD con reintentos.)
- Nunca datos sensibles en `titulo`/`cuerpo`: basta el título de la card y el
  nombre del tablero.

### 6.4 Embed y navegación del Portal

- Ruta del shell: `PALDACA_SHELL_PATH=/planificacion` (ya configurado).
- Menú del módulo en el Portal (`navigationConfig.ts`): Mis tareas,
  Tableros, Equipos e Invitaciones; accesos rápidos del Home en
  `quick-actions.ts`.
- Cada cambio de ruta de la SPA emite `navigate` por el protocolo
  `paldaca-embed`, de modo que la URL del Portal siempre es compartible.
- En el Portal (`navigationConfig.ts`), a medida que existan las pantallas, se
  agregan ítems de menú **que existan de verdad** en el satélite: *Mis
  tareas*, *Tableros*, *Equipos*. Y accesos rápidos en `quick-actions.ts`.
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

### Fase 0 — Cimientos (ya hecho, ajustes menores)

**Hecho:** scaffold federado (SSO, embed, cuenta espejo, `me/`), SPA con
pantallas de estado, arranque desde `iniciar.ps1 -Modo planificacion`,
registro del módulo en el Portal.

**Pendiente antes de la fase 1:**
- Layout base de la SPA: barra lateral (Mis tareas, Tableros, Equipos),
  área de contenido y comportamiento en el celular.
- Convenciones de API: versión (`/api/v1/`), paginación, formato de errores,
  409 por versión, permisos DRF por objeto.
- Base de datos: plan de migración a **MySQL propia** (nunca la instancia del
  Portal) antes de cargar datos reales.

### Fase 1 — Tableros y cards (primera versión útil) — ✅ implementada

**Objetivo:** que un equipo pueda organizar su trabajo en un tablero y
comentar las cards, dentro del Portal.

Alcance:
- **Equipos:** crear, editar, archivar; roles administrador / miembro /
  lector; salir del equipo.
- **Invitaciones:** invitar (entre quienes ya entraron al módulo, §6.2) con
  rol y mensaje; aviso `planificacion.invitacion_equipo` en la campana del
  Portal; aceptar / rechazar desde *Invitaciones*; cancelar; el aviso se
  resuelve al responder.
- **Tablero personal** automático en el primer ingreso.
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

### Fase 2 — Colaboración y notificaciones

**Objetivo:** que el trabajo avise solo y que agregar personas no dependa de
que hayan entrado antes.

Alcance:
- **Portal:** migración con los tipos `planificacion.*` restantes (§6.3);
  endpoint de directorio de solo lectura por módulo (§6.2).
- **Satélite:** emisión de asignación, mención y comentario nuevo (el cliente
  firmado ya existe desde la fase 1).
- **Menciones** con `@` en comentarios (autocompletado entre miembros).
- **Tarea programada diaria** de vencimientos (por vencer / vencida).
- **Historial** de la card y del tablero (pestaña *Actividad* en la card
  abierta).
- **Checklist** dentro de la card, con progreso visible en el tablero.
- **Actualización automática** según §6.5.
- **Mover card** del tablero personal a uno de equipo.
- (Opcional) Aviso de **estado del módulo** fuera del Portal (§6.6).

Criterios de aceptación:
- Asignar a alguien genera exactamente una notificación, a esa persona, con
  enlace que abre la card dentro del Portal.
- Terminar una card vencida resuelve su aviso en la campana.
- Si el Portal está caído, guardar una card funciona igual y el fallo queda
  registrado.
- El vector de prueba de la firma (anexo de la guía) da el valor esperado.

### Fase 3 — Gantt y vistas

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
- Prueba técnica de 2–3 días al inicio para elegir la librería del Gantt.

Criterios de aceptación:
- Un cambio hecho en el Gantt se ve de inmediato en el Tablero y viceversa.
- Cambiar `incluir_en_gantt` de una columna actualiza el Gantt sin tocar las
  cards.
- Una dependencia circular se rechaza con un mensaje claro.

### Fase 4 — Exportación e importación

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
  dependencias.
- El XML abre en MS Project sin advertencias.

### Fase 5 — Flexibilidad avanzada

Se prioriza con lo aprendido en las fases anteriores. Candidatos:

- **Plantillas de tablero:** crear un tablero desde una plantilla (columnas y
  cards con duraciones relativas) y **guardar un tablero como plantilla**.
- **Adjuntos** en las cards (requiere almacenamiento de archivos y límites).
- **Campos personalizados** por tablero (texto, número, lista).
- **Etiquetas** por tablero (por ejemplo, disciplina o cliente).
- **Límite de cards por columna** (estilo Kanban).
- **Tiempo real** con websockets, respetando §6.5.
- **Métricas:** cards terminadas por semana, vencidas por equipo.
- **Vínculo con Hoja de Tiempo** (cargar horas contra una card), si el negocio
  lo pide.

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
| `tableros/` | listar (personal + de mis equipos), crear, ver, editar, archivar |
| `tableros/:id/columnas/` | crear, editar, reordenar, archivar (con destino de cards) |
| `tableros/:id/cards/` | listar (con filtros), crear |
| `cards/:id/` | ver, editar (con `version`), mover (columna + posición), archivar |
| `cards/:id/comentarios/` | listar, crear, editar, borrar |
| `cards/:id/actividad/` | listar (fase 2) |
| `mis-tareas/` | cards donde soy responsable |
| `tableros/:id/gantt/` | cards incluidas, grupos, dependencias, calendario (fase 3) |
| `tableros/:id/exportar/?formato=xlsx|mspdi` | exportación (fase 4) |

---

## 9. Decisiones abiertas

| # | Decisión | Propuesta |
|---|---|---|
| D-01 | ¿Fechas con hora o solo día? | Solo día en fases 1–4 |
| D-02 | ¿Quién crea equipos? | Cualquier usuario con acceso al módulo (**decidido**) |
| D-08 | ¿Cómo se entra a un equipo? | Solo por invitación aceptada (**decidido**) |
| D-03 | Umbral de "vence pronto" | 2 días hábiles, configurable más adelante |
| D-04 | ¿Comentarios en el tablero personal? | Sí, como notas propias (nadie más los ve) |
| D-05 | Librería de Gantt | Prueba técnica al inicio de la fase 3 |
| D-06 | Motor de BD en producción | MySQL propia antes de la fase 1 en producción |
| D-07 | ¿El admin del módulo ve tableros personales? | No: el tablero personal es privado para todos |

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
