# Metodología de trabajo del departamento AIT sobre Planificación

> Cómo organiza AIT su trabajo con el módulo Planificación: un tablero de
> **Soporte** y **un tablero por proyecto**. Dice qué va en cada
> tablero, qué significa cada columna, etiqueta y campo, y cómo se trabaja
> semana a semana.
>
> **Estado: propuesta del 2026-09-30, pendiente de aprobar por el
> departamento.** Lo que falta decidir está en el §9.
>
> Complementa al documento «Metodología de desarrollo de proyectos de
> software» (normas de código, ramas, commits y PR). Aquí solo se trata cómo
> se planifica y se sigue el trabajo; Planificación sustituye a Trello.

## 1. Resumen en una página

1. Todo el trabajo del departamento vive en tableros **del equipo AIT**, no en
   tableros personales.
2. Hay **un solo tablero de Soporte**, permanente, para lo que se atiende sin
   ser un proyecto: lo que falla, lo que piden y el mantenimiento. No es un
   tablero del día a día.
3. Hay **un tablero por proyecto**, creado desde la plantilla «Proyecto de
   software». Un proyecto nunca comparte tablero con otro ni con el soporte.
4. **Una tarjeta es algo que se entrega** en 1 a 10 días hábiles. Los pasos
   van en su checklist.
5. **Solo lleva fecha lo planificado.** Lo demás espera sin fecha. Nunca se
   inventan fechas.
6. **La fecha de fin es un compromiso**: si cambia, se mueve y se comenta el
   motivo en la tarjeta.
7. El lunes se planifica, a diario cada quien mueve sus tarjetas y el viernes
   se envía el Gantt de cada proyecto.

## 2. Qué tableros hay

| Tablero | Cuántos | Para qué | Vistas que se usan |
|---|---|---|---|
| **Soporte** | Uno, permanente | Incidencias, solicitudes pequeñas y mantenimiento | Tablero y Calendario |
| **Proyecto** | Uno por proyecto | Construir un sistema o un módulo, por fases | Tablero, Lista y Gantt |
| Personal | Los que cada quien quiera | Notas y pendientes propios | — |

**Por qué del equipo y no personales:** un tablero personal solo lo ve su
dueño, ni siquiera el administrador del módulo. El trabajo que otro necesita
ver o continuar no puede estar ahí.

**Qué va a dónde:**

| Si el trabajo… | Va en |
|---|---|
| Es una solicitud que se resuelve en menos de 10 días hábiles y la hace una persona | Soporte |
| Es un fallo de un sistema que ya está en producción | Soporte |
| Es mantenimiento preventivo o programado | Soporte |
| Es un sistema o módulo nuevo, con varias entregas o varias personas | Su propio tablero de proyecto |
| Es un fallo encontrado mientras se desarrolla un proyecto | El tablero de ese proyecto |
| Empezó como solicitud y resultó grande | Se **traslada** la tarjeta al tablero del proyecto (o se abre uno) |

## 3. Roles

| Persona | Rol en el equipo | Qué hace en el programa |
|---|---|---|
| Jefatura del departamento / líder de proyecto | Administrador | Crea tableros, columnas, etiquetas y campos; planifica; revisa los hitos |
| Desarrolladores y analistas | Miembro | Crean y mueven tarjetas, comentan, marcan el checklist |
| Gerencia y quien pidió el sistema | Lector | Ve el avance; no edita |

Cada tarjeta planificada tiene **un responsable**. Si trabajan dos personas,
el responsable es quien responde por la fecha.

## 4. Lo que significa cada cosa

Vale para todos los tableros.

| Elemento | Qué dice | Regla |
|---|---|---|
| **Columna** | En qué estado está el trabajo | Una tarjeta está en una sola; se mueve a mano cuando cambia de estado |
| **Etiqueta** | Qué tipo de trabajo es | Pueden ser varias; sirven para filtrar |
| **Campo** | Un dato propio del tablero (fase, requisito, sistema) | Un valor por tarjeta |
| **Urgencia** | Qué se atiende primero | Ver la tabla de abajo |
| **Responsable** | Quién responde por la tarjeta | Recibe los avisos en la campana del Portal |
| **Inicio y fin** | Cuándo se hará | Solo si está planificado; el fin es un compromiso |
| **Checklist** | Los pasos para terminar | Su avance se ve en la tarjeta y en la barra del Gantt |
| **Adjuntos** | Las capturas y documentos que acompañan a la tarjeta | Las imágenes se ven en la propia tarjeta; una captura se pega con Ctrl+V. Hasta 10 MB cada uno; lo más pesado va a la carpeta del proyecto y se pega el enlace |
| **Dependencia** | Una tarjeta espera a otra | Solo donde la espera es real |
| **Comentarios** | Lo que pasó y por qué | Todo cambio de fecha lleva su motivo aquí |

**Urgencia:**

| Urgencia | Significa | Se atiende |
|---|---|---|
| Crítica | Algo está detenido: un sistema caído o el equipo sin poder trabajar | De inmediato; se deja lo demás |
| Alta | Afecta a varias personas o tiene una fecha cercana que no se puede mover | Hoy o mañana |
| Media | Trabajo normal | En su fecha |
| Baja | Puede esperar | Cuando haya hueco |

## 5. Tablero «Soporte»

Uno solo para todo el departamento. No se archiva nunca. Se crea una vez desde
la plantilla «Soporte»; su tarjeta «Tutorial» resume estas reglas
y lista los primeros pasos.

### Qué entra

- **Incidencias:** algo que funcionaba y falló.
- **Solicitudes:** alguien pide algo nuevo o un cambio pequeño.
- **Mantenimiento:** trabajo preventivo o programado (respaldos,
  actualizaciones, equipos).

No entra el día a día del departamento que no es soporte (reuniones, informes,
gestiones): este tablero no es una bitácora. Quien quiera llevarlo usa su
tablero personal.

### Columnas

| Columna | Significa | Entra cuando | Sale cuando |
|---|---|---|---|
| **Entrada** | Llegó y nadie lo ha tomado | Se registra | Alguien lo toma o se le pone fecha |
| **En atención** | Alguien lo está haciendo | Tiene responsable y empezó | Se resuelve o queda esperando |
| **Esperando** | No depende de AIT: falta una respuesta del usuario o de un tercero | Se pidió algo y se comentó qué | Llega la respuesta |
| **Resuelto** | Terminado (columna final) | Se entregó y el solicitante lo sabe | — |

«En atención» lleva un **límite de tarjetas** (sugerido: dos por persona del
departamento). El programa avisa al pasarse, no bloquea: es la señal de que se
está empezando más de lo que se termina.

Las columnas de este tablero se sacan del Gantt: el soporte no se sigue con
un Gantt sino con el Tablero y, para lo que tiene fecha, el Calendario.

### Etiquetas

| Etiqueta | Cuándo se pone |
|---|---|
| **Incidencia** | Algo falló |
| **Solicitud** | Piden algo nuevo o un cambio |
| **Mantenimiento** | Trabajo preventivo o programado |

### Campos

| Campo | Tipo | Para qué |
|---|---|---|
| **Sistema** | Lista | A qué sistema o área pertenece (Portal, Nómina, Hoja de Tiempo, Planificación, Equipos y red, Otro). Permite ver qué sistema da más trabajo |
| **Solicitante** | Texto | Quién lo pidió, para avisarle al resolver |

### Reglas

- **Todo lo que se atiende se registra**, aunque se resuelva en diez minutos.
  Lo que no está en el tablero no se hizo.
- Una tarjeta pasa a «Esperando» **con un comentario** que dice qué se espera
  y de quién.
- Solo lleva fechas lo que tiene día fijado (un mantenimiento programado, una
  entrega prometida). El resto se atiende por urgencia y orden de llegada.
- Si una solicitud resulta necesitar más de 10 días hábiles o varias
  entregas, **deja de ser soporte**: se traslada al tablero de su proyecto o
  se abre uno.

## 6. Tablero de proyecto

**Un tablero por proyecto**, con el nombre del sistema. Se crea desde
*Tableros → nuevo tablero → Empezar con → «Proyecto de software»*, eligiendo
la fecha de inicio: sale con las columnas, etiquetas, campos y el plan tipo ya
fechado en días hábiles, y con una tarjeta «Tutorial» que resume esta
metodología y lista los primeros pasos.

Al terminar el proyecto el tablero se **archiva**; lo que quede pendiente y
los fallos posteriores van al tablero de Soporte.

### Columnas

| Columna | Significa | Regla |
|---|---|---|
| **Pendientes** | Todo lo que falta y aún no tiene fecha (el *product backlog*) | Fuera del Gantt. Lo nuevo que aparece a mitad de una fase entra aquí |
| **Planificado** | Tiene fecha y responsable, no ha empezado | Se llena en la planificación del lunes |
| **En curso** | Alguien lo está haciendo | — |
| **En revisión** | Quien lo hizo terminó; falta que otro lo revise o lo valide | Equivale a un PR abierto o a una validación pendiente |
| **Hecho** | Terminado (columna final) | Cumple el criterio de aceptación y su documentación está al día |

### Fases (campo «Fase»)

La fase es un **dato de la tarjeta**, no una columna: así el tablero muestra
el estado y el Gantt, con «Agrupar: Fase», muestra cada fase con su avance.

| Fase | Entrega |
|---|---|
| **Fase 0 · Configuración** | Documentación general, arquitectura, repositorio y entorno; el programa arranca y se publica vacío |
| **Fase 1…N · (nombre del módulo)** | Un módulo usable y revisado por fase |
| **Cierre** | En producción, con manual, entregado a soporte |

Dentro de cada fase de módulo el orden es siempre el mismo: **documentar el
módulo → historias de usuario → pruebas → revisión**. El alcance de una fase
no crece a mitad de camino: lo nuevo va a «Pendientes».

Las opciones de «Fase» se renombran con el nombre real de cada módulo en
*«…» → Etiquetas y campos*; las tarjetas siguen a la opción renombrada.

### Campos

| Campo | Tipo | Qué se escribe |
|---|---|---|
| **Fase** | Lista | La fase a la que pertenece la tarjeta |
| **Requisito** | Texto | El código de la historia de usuario o requisito que cubre (`HU-1.2`, `RF-3.1`, `RNF-0.1`). Una tarjeta de desarrollo sin requisito es alcance que se coló |
| **Rama** | Texto | La rama o el PR donde está el trabajo (opcional) |

### Etiquetas

| Etiqueta | Cuándo se pone |
|---|---|
| **Documentación** | La tarjeta produce documentos: diseño, requisitos, manual |
| **Desarrollo** | La tarjeta produce código o configuración |
| **Pruebas** | La tarjeta verifica lo construido |
| **Hito** | Cierre de una fase: tarjeta de un día con la reunión de revisión. Se dibuja como un **rombo** en el Gantt (la etiqueta está marcada como «de hito»). Filtrar por «Hito» deja el Gantt solo con los cierres |
| **Error** | Fallo que no detiene el trabajo: entra en «Pendientes» y se planifica después |
| **Hotfix** | Fallo que rompe el sistema o detiene al equipo: urgencia crítica y directo a «En curso» |
| **Cambio mayor** | Una corrección que deja vieja la documentación: primero se actualiza el documento del módulo |
| **Bloqueada** | No puede avanzar; el motivo va en un comentario |

### Reglas

- **Hito = compromiso de fecha de la fase.** La tarjeta «Revisión del
  módulo» depende de las demás de su fase; su fecha es la que se informa.
- **Dependencias solo donde una cosa espera a otra.** Con «Mover sucesoras»
  activado, retrasar una tarjeta empuja a las que dependen de ella.
- **Corrección menor** tras la revisión: tarjeta nueva en la misma fase.
  **Corrección mayor:** etiqueta «Cambio mayor» y se vuelve a «Documentar el
  módulo».
- **Terminar incluye documentar.** La documentación no es una fase: una
  tarjeta no pasa a «Hecho» con su documento desactualizado.
- La documentación del proyecto vive en el repositorio (`docs/`); la tarjeta
  lleva el enlace en su descripción. Lo que no es código (un acta, un plano,
  una captura) se **adjunta** a la tarjeta, bajo la descripción.

## 7. Cómo se trabaja

### Cada día (cada persona)

1. Abrir **Mis tareas**: ahí están sus tarjetas de todos los tableros, con lo
   vencido primero.
2. Mover cada tarjeta a la columna donde está de verdad y marcar el checklist.
3. Si una fecha no se va a cumplir: moverla y **comentar el motivo**.
4. Registrar en Soporte lo que llegó por fuera (llamada, correo, pasillo).

### Lunes: planificar (30 minutos, todo el departamento)

1. **Soporte:** revisar «Entrada» (asignar o fechar), lo vencido y lo que
   lleva más de una semana en «Esperando».
2. **Cada proyecto**, con el Gantt agrupado por Fase:
   - Lo vencido: se termina, se mueve con su motivo o se parte.
   - De «Pendientes» a «Planificado» lo de la semana, con fecha y responsable.
   - ¿Se mantiene la fecha del próximo hito?

### Viernes: informar

1. **Gantt en PDF** de cada proyecto, agrupado por Fase, para la jefatura y
   quien pidió el sistema.
2. En Soporte, archivar lo resuelto de la semana.

### Al cerrar una fase

Reunión de revisión con todo el equipo y los líderes (la tarjeta «Hito»):
demostración, criterios de aceptación de cada historia, requisitos no
funcionales y documentación al día. Si se aprueba, la tarjeta pasa a «Hecho» y
empieza la fase siguiente.

### Ciclo de un proyecto

1. Se crea el tablero desde la plantilla, con la fecha de inicio real.
2. Se renombran las fases con los módulos del proyecto y se archivan las
   tarjetas de los módulos que sobren.
3. **Fase 0:** documentación general, arquitectura, repositorio y despliegue
   vacío. Hito «Fase 0 aprobada».
4. **Por cada módulo:** se documenta (de ahí salen las historias con su
   código), se crea una tarjeta por historia, se desarrolla, se prueba y se
   revisa.
5. **Cierre:** producción, manual y entrega a soporte. Se archiva el tablero.

### Ciclo de una solicitud de soporte

1. Se registra en «Entrada» con etiqueta, sistema, solicitante y urgencia.
2. Quien la toma se pone de responsable y la pasa a «En atención».
3. Si falta algo del usuario: a «Esperando», con un comentario.
4. Resuelta: a «Resuelto» y se avisa al solicitante.

## 8. Qué cambia respecto al documento de metodología de desarrollo

| En el documento | Con Planificación |
|---|---|
| Trello | Planificación (un tablero por proyecto) |
| Product Backlog | Columna «Pendientes» |
| Iteration Backlog | Las tarjetas de la fase actual en Planificado, En curso y En revisión |
| Iteración por hitos, sin plazo | El hito sigue siendo un logro, pero **con fecha compromiso** |
| Incremento | Las tarjetas de la fase en «Hecho» y su hito aprobado |
| Errores menores al Product Backlog | Etiqueta «Error» en «Pendientes» |
| Hotfix | Etiqueta «Hotfix», urgencia crítica |
| Documentación en Google Drive | En el repositorio; Drive queda para recursos gráficos y manuales externos |

## 9. Pendiente de decidir

1. **Aprobar esta metodología** (o ajustarla) en el departamento.
2. **Nombre y miembros del equipo** de AIT en el módulo, y quién es
   administrador.
3. **Opciones del campo «Sistema»** del tablero de Soporte.
4. **Límite de «En atención»**: cuántas tarjetas a la vez.
5. Del documento de desarrollo: si el código en inglés, Conventional Commits
   y el PR obligatorio a `main` aplican a los repositorios actuales o solo a
   proyectos nuevos.

## 10. Lo que el programa todavía no hace

- **No se filtra por campo** (por ejemplo, ver solo un sistema o una fase en
  el Tablero); sí se agrupa el Gantt por un campo de lista.
- **Los enlaces de la descripción no tienen clic**: se copian y se pegan. Sí
  hay adjuntos (hasta 10 MB por archivo).
- **No hay vista de todos los proyectos**: quien dirige varios abre cada
  tablero.
- **Esta metodología no está todavía en el Centro de ayuda** del programa.
