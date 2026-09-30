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
    "resumen": "Cómo se lleva un proyecto de software con la plantilla del mismo nombre: un tablero por proyecto, una fase por módulo y un hito al cerrar cada una. Es la metodología de trabajo del departamento.",
    "entradas": [
        {
            "id": "que-es",
            "titulo": "Qué trae la plantilla «Proyecto de software»",
            "parrafos": [
                "Un tablero listo para desarrollar un sistema por módulos, con el plan tipo ya fechado en días hábiles:",
                "• **Fase 0 · Configuración**: documentación general, arquitectura, repositorio y entorno, despliegue vacío y su hito.",
                "• **Tres fases de módulo**: en cada una, documentar el módulo, tres historias de usuario, pruebas y la revisión (el hito).",
                "• **Cierre**: paso a producción, manual y entrega a soporte, y el hito «Proyecto entregado».",
                "Trae también las columnas, las etiquetas, los campos «Fase», «Requisito» y «Rama», y una tarjeta **Tutorial** con los primeros pasos."
            ]
        },
        {
            "id": "crear",
            "titulo": "Crear el tablero de un proyecto",
            "parrafos": [
                "**Un tablero por proyecto**, con el nombre del sistema. En **Tableros**, crea un tablero del equipo del departamento, elige **Empezar con → Proyecto de software** y pon la fecha de inicio real: todas las tarjetas se fechan desde ese día, saltando fines de semana y feriados.",
                "Nunca en un tablero personal: solo lo ve su dueño, y el trabajo del equipo tiene que poder verlo y continuarlo otro.",
                "Roles: quien dirige el proyecto es **administrador** del equipo (crea el tablero y ajusta columnas, etiquetas y campos); quien desarrolla, **miembro**; la gerencia y quien pidió el sistema, **lector** (ve el avance, no edita)."
            ]
        },
        {
            "id": "primeros-pasos",
            "titulo": "Primeros pasos después de crearlo",
            "parrafos": [
                "Son los del checklist de la tarjeta **Tutorial** (en Pendientes):",
                "• Renombra las fases con los módulos reales en «…» → **Etiquetas y campos** → campo **Fase**. Las tarjetas siguen a la opción renombrada.",
                "• Archiva las tarjetas de los módulos que sobren (y, para un módulo más, añade sus tarjetas con la misma fase).",
                "• Pon responsable a las tarjetas de la Fase 0.",
                "• Revisa las fechas en el **Gantt** con **Agrupar: Fase**.",
                "• Adjunta en «Documentación general del proyecto» lo que todo el equipo deba leer.",
                "• Archiva la tarjeta Tutorial."
            ]
        },
        {
            "id": "columnas",
            "titulo": "Las columnas: el estado del trabajo",
            "parrafos": [
                "• **Pendientes**: todo lo que falta y aún no tiene fecha. Está **fuera del Gantt**. Lo nuevo que aparece a mitad de una fase entra aquí.",
                "• **Planificado**: tiene fecha y responsable, pero no ha empezado.",
                "• **En curso**: alguien lo está haciendo.",
                "• **En revisión**: quien lo hizo terminó; falta que otro lo revise o lo valide (el PR abierto, la validación con el usuario).",
                "• **Hecho**: cumple su criterio de aceptación y su documentación está al día."
            ]
        },
        {
            "id": "fases",
            "titulo": "Las fases: el campo «Fase»",
            "parrafos": [
                "La fase es un **dato de la tarjeta**, no una columna: así el tablero muestra en qué estado está cada cosa y el Gantt, con **Agrupar: Fase**, muestra cada fase con su barra resumen y su avance (hechas/total).",
                "• **Fase 0 · Configuración**: el programa arranca y se publica vacío.",
                "• **Una fase por módulo**: cada una termina con un módulo usable y revisado.",
                "• **Cierre**: en producción, con manual, entregado a soporte."
            ]
        },
        {
            "id": "modulo",
            "titulo": "Cómo avanza cada módulo",
            "parrafos": [
                "Siempre en el mismo orden, encadenado con dependencias:",
                "• **Documentar el módulo**: propósito, actores y roles, historias de usuario con su criterio de aceptación, requisitos, flujo, datos y bosquejos.",
                "• **Historias de usuario**: una tarjeta por historia, de 1 a 10 días hábiles. Si una pasa de 10, se parte.",
                "• **Pruebas del módulo**: recorrido con cada rol, permisos, teléfono.",
                "• **Revisión del módulo** (el hito): la reunión con el equipo y los líderes.",
                "El alcance de una fase **no crece a mitad de camino**: lo nuevo va a Pendientes y se planifica después."
            ]
        },
        {
            "id": "requisito",
            "titulo": "Los campos «Requisito» y «Rama»",
            "parrafos": [
                "**Requisito** dice qué necesidad cubre la tarjeta, con el código que se le dio al documentar el módulo:",
                "• **HU-1.2**: historia de usuario (módulo 1, historia 2).",
                "• **RF-3.1**: requisito funcional, algo que el sistema debe hacer.",
                "• **RNF-0.1**: requisito no funcional (seguridad, rendimiento, teléfono, integración con el Portal).",
                "Una tarjeta de desarrollo sin requisito es alcance que se coló. En la revisión del módulo se comprueba que cada requisito tiene su tarjeta en Hecho.",
                "**Rama** guarda la rama o el PR donde está el trabajo (opcional)."
            ]
        },
        {
            "id": "etiquetas",
            "titulo": "Qué significa cada etiqueta",
            "parrafos": [
                "• **Documentación**: la tarjeta produce documentos (diseño, requisitos, manual).",
                "• **Desarrollo**: produce código o configuración.",
                "• **Pruebas**: verifica lo construido.",
                "• **Hito**: cierre de una fase. Se dibuja como un **rombo** en el Gantt.",
                "• **Error**: un fallo que no detiene el trabajo. Entra en Pendientes y se planifica después.",
                "• **Hotfix**: un fallo que rompe el sistema o detiene al equipo. Urgencia crítica y directo a En curso.",
                "• **Cambio mayor**: una corrección que deja vieja la documentación. Primero se actualiza el documento del módulo.",
                "• **Bloqueada**: no puede avanzar; el motivo va en un comentario."
            ]
        },
        {
            "id": "hitos",
            "titulo": "Los hitos: el compromiso de cada fase",
            "parrafos": [
                "La tarjeta de revisión de cada fase lleva la etiqueta **Hito** y es un **rombo** en el Gantt. Depende de las demás tarjetas de su fase: su fecha es la que se informa como fecha de la fase.",
                "En la reunión de revisión se recorre su checklist: demostración del módulo, criterios de aceptación de cada historia, seguridad y permisos, rendimiento, documentación al día y cambios integrados en main. Si se aprueba, pasa a Hecho y empieza la fase siguiente.",
                "Filtrando por la etiqueta **Hito**, el Gantt (y su PDF) queda solo con los cierres: la vista para informar fechas."
            ]
        },
        {
            "id": "reglas",
            "titulo": "Las reglas de las tarjetas",
            "parrafos": [
                "• **Una tarjeta es algo que se entrega** en 1 a 10 días hábiles. Los pasos van en su checklist.",
                "• **Solo lleva fecha lo planificado.** Lo demás espera en Pendientes. Nunca se inventan fechas.",
                "• **La fecha de fin es un compromiso**: si cambia, se mueve y se comenta el motivo en la tarjeta.",
                "• **Dependencias solo donde una tarjeta espera de verdad a otra.** Con **Mover sucesoras** activado, retrasar una empuja a las que dependen de ella.",
                "• **Terminar incluye documentar**: una tarjeta no pasa a Hecho con su documento desactualizado."
            ]
        },
        {
            "id": "correcciones",
            "titulo": "Errores y correcciones",
            "parrafos": [
                "• **Error encontrado mientras se desarrolla**: tarjeta nueva en Pendientes, con la etiqueta **Error**, en este mismo tablero.",
                "• **Algo que detiene al equipo**: etiqueta **Hotfix**, urgencia crítica y directo a En curso.",
                "• **Corrección menor tras la revisión** (textos, colores, un ajuste): tarjeta nueva en la misma fase.",
                "• **Corrección mayor** (cambia pantallas, datos o un módulo entero): etiqueta **Cambio mayor** y se vuelve a «Documentar el módulo».",
                "Un fallo de un sistema que ya está en producción no va aquí: va al tablero de **Soporte**."
            ]
        },
        {
            "id": "ritmo",
            "titulo": "El ritmo de la semana",
            "parrafos": [
                "• **Cada día**, cada persona abre **Mis tareas**, mueve sus tarjetas a la columna donde están de verdad y marca su checklist.",
                "• **Lunes** (planificación del equipo): lo vencido se termina, se mueve con su motivo o se parte; de Pendientes a Planificado lo de la semana, con fecha y responsable; ¿se mantiene la fecha del próximo hito?",
                "• **Viernes**: **Gantt en PDF**, agrupado por Fase, para la jefatura y quien pidió el sistema."
            ]
        },
        {
            "id": "cerrar",
            "titulo": "Cerrar el proyecto",
            "parrafos": [
                "La fase **Cierre** termina con el hito «Proyecto entregado»: en producción, con su manual y entregado a soporte.",
                "Después, el tablero se **archiva**. Lo que quede pendiente y los fallos que aparezcan en producción van al tablero de **Soporte**."
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
