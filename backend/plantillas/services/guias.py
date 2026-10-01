"""
Guías del Centro de ayuda que traen las plantillas del programa (`del_sistema`).

Una guía viaja en el `contenido` de la plantilla (clave `ayuda`) y se copia al
tablero que se crea con ella (`Tablero.ayuda`): el Centro de ayuda la muestra
como una pestaña más **solo en ese tablero**. Formato: `titulo` (el nombre de
la pestaña), `resumen` y `entradas` [{`id`, `titulo`, `parrafos`}]; en los
párrafos, «• » al principio es un punto de lista y `**así**` va en negrita,
como en `frontend/src/components/ayuda/contenido.ts`.

Resumen de `docs/metodologia-de-trabajo.md`: si cambia la metodología, cambia
esta guía (y después `manage.py instalar_plantillas --actualizar`).
"""

GUIA_PROYECTO = {
    "titulo": "Proyecto de software",
    "resumen": "La metodología del departamento para desarrollar un sistema: un tablero por proyecto, una fase por módulo y un hito con la fecha de entrega de cada módulo. Empieza por «El flujo de desarrollo en una mirada»; después, cómo se cargan las tareas, cómo se arma cada fase y cómo funcionan los hitos.",
    "entradas": [
        {
            "id": "flujo",
            "titulo": "El flujo de desarrollo en una mirada",
            "parrafos": [
                "1. **Se crea el tablero** desde la plantilla, con la fecha de inicio real. Sale con todo el plan tipo ya fechado.",
                "2. **Fase 0 · Configuración**: documentación general, arquitectura, repositorio y entorno; el programa arranca y se publica vacío. Cierra con su hito.",
                "3. **Una fase por módulo**, siempre en el mismo orden: **documentar el módulo → historias de usuario → pruebas → revisión** (el hito, con la fecha de entrega del módulo).",
                "4. **Cierre**: paso a producción, manual y entrega. Cierra con el hito «Proyecto entregado» y el tablero se archiva.",
                "Cada tarea recorre las columnas de izquierda a derecha: **Pendientes → Planificado → En curso → En revisión → Hecho**."
            ]
        },
        {
            "id": "reglas",
            "titulo": "La metodología en siete reglas",
            "parrafos": [
                "1. **Un tablero por proyecto**, del equipo del departamento y nunca personal.",
                "2. **Una tarjeta es algo que se entrega** en 1 a 10 días hábiles. Los pasos van en su checklist; si pasa de 10 días, se parte.",
                "3. **Solo lleva fecha lo planificado.** Lo demás espera sin fecha en «Pendientes». Nunca se inventan fechas.",
                "4. **La fecha de fin es un compromiso**: si cambia, se mueve y se comenta el motivo en la tarjeta.",
                "5. **Cada módulo es una fase** que termina en un hito con su fecha de entrega.",
                "6. **El alcance de una fase no crece a mitad de camino**: lo nuevo va a «Pendientes».",
                "7. **Ritmo semanal**: el lunes se planifica, a diario cada quien mueve sus tarjetas y el viernes se envía el Gantt."
            ]
        },
        {
            "id": "crear",
            "titulo": "Crear el tablero y quién hace qué",
            "parrafos": [
                "En **Tableros**, crea un tablero del equipo del departamento con el nombre del sistema, elige **Empezar con → Proyecto de software** y pon la **fecha de inicio real**.",
                "• **Administrador** (quien dirige el proyecto): ajusta fases, etiquetas y columnas, planifica y fija las fechas de los hitos.",
                "• **Miembro** (quien desarrolla o analiza): carga y mueve sus tarjetas, comenta y marca el checklist.",
                "• **Lector** (la gerencia y quien pidió el sistema): ve el avance, no edita.",
                "Cada tarjeta planificada tiene **un responsable**: quien responde por su fecha."
            ]
        },
        {
            "id": "primeros-pasos",
            "titulo": "Primeros pasos después de crearlo",
            "parrafos": [
                "Son los del checklist de la tarjeta **Metodología del proyecto** (en Pendientes):",
                "• Renombra las fases con los módulos reales en «…» → **Etiquetas y campos** → campo **Fase**. Las tarjetas siguen a la opción renombrada.",
                "• Archiva las tarjetas de los módulos que sobren; para un módulo más, créalas como se explica en «Cómo se arma cada fase».",
                "• Reemplaza las «Historia de usuario 1, 2, 3» por las historias reales de cada módulo (cuando se documente).",
                "• Pon responsable a las tarjetas de la Fase 0.",
                "• Revisa en el **Gantt** con **Agrupar: Fase** que cada hito tenga la fecha de entrega comprometida de su módulo.",
                "• Archiva la tarjeta de metodología cuando todos la hayan leído."
            ]
        },
        {
            "id": "cargar",
            "titulo": "Cómo se carga una tarea",
            "parrafos": [
                "**Si ya tiene fecha**, desde el **Gantt**: **+ Tarea** pide título, responsable, inicio, fin y urgencia en un paso, con el atajo **+ Fase** para elegir su fase ahí mismo. Para que vaya después de otra, usa el **+** que aparece al pasar por la fila de la anterior, o elígela en **Empieza después de**: queda creada la dependencia y **toma la Fase de la anterior**. **Crear y añadir otra** conserva la Fase: así se carga un módulo entero seguido.",
                "**Si todavía no tiene fecha**, desde el **Tablero**: **Añadir tarjeta** al pie de **Pendientes**. Se le pone fecha y responsable en la planificación del lunes.",
                "La que se crea en Pendientes se abre para ponerle su **Fase**. A todas, ponles también su etiqueta (Desarrollo, Documentación o Pruebas). Una tarjeta sin fase aparece en el grupo «Sin fase» del Gantt: es la señal de que falta.",
                "En la descripción va el detalle y el **criterio de aceptación**; los pasos, en el checklist."
            ]
        },
        {
            "id": "fase",
            "titulo": "Cómo se arma cada fase",
            "parrafos": [
                "Todas las tarjetas de un módulo llevan **la misma Fase**. Se crean en este orden y se encadenan así:",
                "1. **Documentar el módulo** (etiqueta Documentación): de aquí salen las historias de usuario, con su criterio de aceptación. Va después del hito de la fase anterior.",
                "2. **Una tarjeta por historia de usuario** (etiqueta Desarrollo), de 1 a 10 días hábiles. Cada una **depende de «Documentar el módulo»**; entre historias solo si una espera de verdad a otra.",
                "3. **Pruebas del módulo** (etiqueta Pruebas): **depende de todas las historias**.",
                "4. **Revisión del módulo** (etiqueta **Hito**): un día, **depende de las pruebas**. Su fecha es la entrega del módulo.",
                "Así, en el Gantt la fase se lee de izquierda a derecha y termina en su rombo."
            ]
        },
        {
            "id": "hitos",
            "titulo": "Cómo funcionan los hitos",
            "parrafos": [
                "**Un hito por fase**: la tarjeta «Revisión del módulo». Dura **un día**, el de la entrega del módulo, y lleva la etiqueta **Hito**: en el Gantt y en su PDF es un **rombo**.",
                "**No se carga como una barra que cubra todo el módulo.** El tramo completo de la fase (del primer inicio al último fin) ya lo muestra el Gantt con **Agrupar: Fase**: cada fase tiene su barra resumen con el avance (hechas/total). El hito marca el punto final.",
                "**Las tareas quedan asociadas al hito de dos formas**: llevan **la misma Fase**, y el hito **depende** de las pruebas, que dependen de las historias. Si una tarea se retrasa con **Mover sucesoras** activado, la cadena empuja al hito y el atraso de la entrega se ve.",
                "**Cambiar la fecha de entrega** es mover el hito y comentar el motivo. Las tareas de la fase tienen que caber antes: una flecha roja punteada avisa de una dependencia que no se cumple.",
                "En la **reunión de revisión** se recorre el checklist del hito: demostración, criterios de aceptación de cada historia, seguridad y permisos, rendimiento, documentación al día y cambios integrados en main. Si se aprueba, el hito pasa a Hecho y empieza la fase siguiente.",
                "Filtrando por la etiqueta **Hito**, el Gantt queda solo con las fechas de entrega: la vista para informar."
            ]
        },
        {
            "id": "uso",
            "titulo": "La forma correcta de usar el tablero",
            "parrafos": [
                "El tablero dice **en qué estado está** cada tarea; el Gantt, **cuándo**. Se mueven a mano, cuando cambia la realidad:",
                "• **Pendientes**: está identificada pero sin fecha (el backlog). Fuera del Gantt.",
                "• **Planificado**: el lunes se le puso fecha y responsable; todavía no empezó.",
                "• **En curso**: el responsable la empezó.",
                "• **En revisión**: quien la hizo terminó; falta que otro la revise o la valide (el PR abierto, la validación con el usuario).",
                "• **Hecho**: cumple su criterio de aceptación y su documentación está al día.",
                "Una tarjeta en «En curso» sin movimiento en días, o vencida sin comentario, es lo primero que se mira el lunes."
            ]
        },
        {
            "id": "tarjeta",
            "titulo": "Cómo es una buena tarjeta",
            "parrafos": [
                "• **Título**: lo que se entrega («Pantalla de alta de proveedores»), no la actividad («Trabajar en proveedores»).",
                "• **Fase**, **responsable** y, si está planificada, **inicio y fin**.",
                "• **Checklist**: los pasos para terminarla; su avance rellena la barra del Gantt.",
                "• **Descripción**: el detalle y el criterio de aceptación. La documentación vive en el repositorio; aquí va el enlace.",
                "• **Adjuntos**: capturas y documentos (una captura se pega con Ctrl+V).",
                "• **Comentarios**: lo que pasó y por qué. Todo cambio de fecha lleva aquí su motivo."
            ]
        },
        {
            "id": "etiquetas",
            "titulo": "Qué significa cada etiqueta",
            "parrafos": [
                "• **Documentación**: produce documentos (diseño, requisitos, manual).",
                "• **Desarrollo**: produce código o configuración.",
                "• **Pruebas**: verifica lo construido.",
                "• **Hito**: la revisión que cierra una fase; un rombo en el Gantt.",
                "• **Error**: un fallo que no detiene el trabajo. Entra en Pendientes y se planifica después.",
                "• **Hotfix**: un fallo que rompe el sistema o detiene al equipo. Urgencia crítica y directo a En curso.",
                "• **Cambio mayor**: una corrección que deja vieja la documentación; primero se actualiza el documento del módulo.",
                "• **Bloqueada**: no puede avanzar; el motivo va en un comentario."
            ]
        },
        {
            "id": "urgencia",
            "titulo": "Qué urgencia poner",
            "parrafos": [
                "• **Crítica**: algo está detenido (el sistema caído, el equipo sin poder trabajar). Se atiende de inmediato.",
                "• **Alta**: afecta a varias personas o tiene una fecha cercana que no se puede mover.",
                "• **Media**: trabajo normal, en su fecha.",
                "• **Baja**: puede esperar."
            ]
        },
        {
            "id": "correcciones",
            "titulo": "Errores y correcciones",
            "parrafos": [
                "• **Error encontrado mientras se desarrolla**: tarjeta nueva en Pendientes, con su Fase y la etiqueta **Error**.",
                "• **Algo que detiene al equipo**: etiqueta **Hotfix**, urgencia crítica y directo a En curso.",
                "• **Corrección menor tras la revisión** (textos, colores, un ajuste que no cambia la documentación): tarjeta nueva en la misma fase.",
                "• **Corrección mayor** (cambia pantallas, datos o el módulo): etiqueta **Cambio mayor** y se vuelve a «Documentar el módulo».",
                "**Terminar incluye documentar**: una tarjeta no pasa a Hecho con su documento desactualizado."
            ]
        },
        {
            "id": "ritmo",
            "titulo": "El ritmo de la semana",
            "parrafos": [
                "• **Cada día**, cada persona abre **Mis tareas** (sus tarjetas de todos los tableros, lo vencido primero), mueve cada una a la columna donde está de verdad y marca su checklist.",
                "• **Lunes** (30 minutos, con el Gantt agrupado por Fase): lo vencido se termina, se mueve con su motivo o se parte; de Pendientes a Planificado lo de la semana, con fecha y responsable; ¿se mantiene la fecha del próximo hito?",
                "• **Viernes**: **Gantt en PDF**, agrupado por Fase, para la jefatura y quien pidió el sistema."
            ]
        },
        {
            "id": "cerrar",
            "titulo": "Cerrar el proyecto",
            "parrafos": [
                "La fase **Cierre** termina con el hito «Proyecto entregado»: el sistema en producción, con su manual y entregado a quien lo va a mantener.",
                "Después, el tablero se **archiva**: queda de consulta, con todo su historial."
            ]
        },
        {
            "id": "equivalencias",
            "titulo": "Equivalencias con la metodología de desarrollo",
            "parrafos": [
                "Para quien viene de Scrum o de Trello:",
                "• **Product Backlog** → la columna Pendientes.",
                "• **Iteration Backlog** → las tarjetas de la fase actual en Planificado, En curso y En revisión.",
                "• **Iteración por hitos** → una fase, que termina en un hito **con fecha de entrega**.",
                "• **Incremento** → las tarjetas de la fase en Hecho y su hito aprobado.",
                "• **Trello** → este tablero; la documentación, en el repositorio del proyecto."
            ]
        }
    ]
}

GUIA_SOPORTE = {
    "titulo": "Soporte",
    "resumen": "Cómo se trabaja en el tablero de Soporte: lo que el departamento atiende sin ser un proyecto (lo que falla, lo que piden y el mantenimiento). Hay uno solo y no se archiva.",
    "entradas": [
        {
            "id": "que-entra",
            "titulo": "Qué entra en este tablero",
            "parrafos": [
                "• **Incidencia**: algo que funcionaba y falló.",
                "• **Solicitud**: alguien pide algo nuevo o un cambio pequeño.",
                "• **Mantenimiento**: trabajo preventivo o programado (respaldos, actualizaciones, equipos).",
                "No entra el día a día del departamento que no es soporte (reuniones, informes, gestiones): este tablero no es una bitácora.",
                "Si algo necesita más de 10 días hábiles o varias entregas, **deja de ser soporte**: se traslada al tablero de su proyecto (menú de la tarjeta → Trasladar) o se abre uno."
            ]
        },
        {
            "id": "columnas",
            "titulo": "Las columnas",
            "parrafos": [
                "• **Entrada**: llegó y nadie lo ha tomado.",
                "• **En atención**: alguien lo está haciendo; tiene responsable. Lleva un límite de tarjetas: si se pasa, se está empezando más de lo que se termina.",
                "• **Esperando**: no depende del departamento; falta una respuesta del usuario o de un tercero. Se pasa aquí **con un comentario** que diga qué se espera y de quién.",
                "• **Resuelto**: se entregó y el solicitante lo sabe.",
                "Este tablero no usa el Gantt: se sigue con el Tablero y, para lo que tiene fecha, con el Calendario."
            ]
        },
        {
            "id": "registrar",
            "titulo": "Registrar lo que llega",
            "parrafos": [
                "Todo lo que se atiende se registra, aunque se resuelva en diez minutos: lo que no está en el tablero no se hizo.",
                "Al crearla, pon a la tarjeta su **etiqueta** (Incidencia, Solicitud o Mantenimiento), el **Sistema** al que pertenece, el **Solicitante** y la **urgencia**. Una captura del problema se adjunta pegándola con Ctrl+V.",
                "Solo lleva fechas lo que tiene día fijado (un mantenimiento programado, una entrega prometida). El resto se atiende por urgencia y orden de llegada."
            ]
        },
        {
            "id": "urgencia",
            "titulo": "Qué urgencia poner",
            "parrafos": [
                "• **Crítica**: algo está detenido (un sistema caído, el equipo sin poder trabajar). Se atiende de inmediato.",
                "• **Alta**: afecta a varias personas o tiene una fecha cercana que no se puede mover. Hoy o mañana.",
                "• **Media**: trabajo normal.",
                "• **Baja**: puede esperar; cuando haya hueco."
            ]
        },
        {
            "id": "campos",
            "titulo": "Los campos «Sistema» y «Solicitante»",
            "parrafos": [
                "**Sistema** dice a qué sistema o área pertenece; con él se ve qué sistema da más trabajo. Sus opciones se ajustan en «…» → **Etiquetas y campos**.",
                "**Solicitante** es quién lo pidió, para avisarle al resolver."
            ]
        },
        {
            "id": "ritmo",
            "titulo": "El ritmo de la semana",
            "parrafos": [
                "• **Cada día**: registrar lo que llega y mover las tarjetas.",
                "• **Lunes**: revisar Entrada (asignar o fechar), lo vencido y lo que lleva más de una semana en Esperando.",
                "• **Viernes**: archivar lo resuelto de la semana."
            ]
        }
    ]
}
