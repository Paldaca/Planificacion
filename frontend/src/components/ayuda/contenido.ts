/**
 * Texto del Centro de ayuda: una guía por vista del tablero y las preguntas
 * frecuentes. Formato mínimo: cada entrada es una lista de párrafos; un
 * párrafo que empieza por «• » es un punto de lista y `**así**` va en
 * negrita.
 *
 * Si cambias cómo funciona algo que se explica aquí, cambia también el texto
 * (en el mismo cambio, como la documentación).
 */

export type Tema = "tablero" | "lista" | "calendario" | "gantt" | "preguntas";

export type EntradaAyuda = { id: string; titulo: string; parrafos: string[] };

export type TemaAyuda = { id: Tema; etiqueta: string; resumen: string; entradas: EntradaAyuda[] };

const TABLERO: TemaAyuda = {
  id: "tablero",
  etiqueta: "Tablero",
  resumen:
    "Las tarjetas ordenadas en columnas según su estado. Arrastrarlas de una columna a otra es la forma más rápida de avanzar el trabajo.",
  entradas: [
    {
      id: "crear",
      titulo: "Crear una tarjeta",
      parrafos: [
        "Pulsa **Añadir tarjeta** al pie de una columna, escribe el título y pulsa Enter. Puedes seguir escribiendo otra enseguida.",
        "Después ábrela para ponerle fechas, responsables, urgencia y el resto del detalle.",
      ],
    },
    {
      id: "mover",
      titulo: "Mover una tarjeta de columna",
      parrafos: [
        "Arrástrala a otra columna, o arriba y abajo dentro de la misma para cambiar su orden.",
        "Con el teclado: Espacio o Enter para tomarla, las flechas para moverla, Espacio o Enter para soltarla y Escape para cancelar.",
      ],
    },
    {
      id: "terminar",
      titulo: "Dar una tarjeta por terminada",
      parrafos: [
        "Llévala a la **columna final** (por defecto «Hecho», con una marca verde). Queda terminada (tachada en la Lista, el Calendario y el Gantt) y deja de contar como vencida.",
        "Si la sacas de esa columna vuelve a estar abierta.",
      ],
    },
    {
      id: "detalle",
      titulo: "Qué hay dentro de una tarjeta",
      parrafos: [
        "Haz clic en una tarjeta para abrirla. Ahí tienes:",
        "• **Descripción**, **adjuntos** y **checklist** (su avance se ve en la tarjeta).",
        "• **Fechas** de inicio y fin, **urgencia**, **etiquetas** y los **campos** propios del tablero.",
        "• **Responsables**: reciben un aviso en la campana del Portal.",
        "• **Comentarios** con @menciones, y la **Actividad**: el historial de todo lo que cambió.",
        "• **Gantt**: si la tarjeta entra en el Gantt «Según columna», siempre o nunca.",
        "Cada tarjeta tiene un número (#12): puedes buscarla por él o compartir su enlace.",
      ],
    },
    {
      id: "adjuntos",
      titulo: "Adjuntar archivos a una tarjeta",
      parrafos: [
        "Dentro de la tarjeta, bajo la descripción, está **Adjuntos**: pulsa **Adjuntar** (puedes elegir varios), suelta los archivos encima o **pega una captura con Ctrl+V**.",
        "Las **imágenes** (PNG, JPG, GIF, WebP) se ven ahí mismo como miniaturas; al pulsar una se abre a pantalla completa, con flechas para pasar a la siguiente. Lo demás (un Word, un PDF) se descarga con un clic. Quien solo consulta el tablero también los ve y los descarga.",
        "En el tablero, la tarjeta muestra un **clip** con cuántos adjuntos tiene y, si tiene imágenes, la primera como **portada**.",
        "• Las imágenes grandes se reducen al subirlas (1920 px de lado, de sobra para verlas en pantalla). Si necesitas el original a máxima resolución, déjalo en la carpeta del proyecto.",
        "• Hasta **10 MB** por archivo y 20 archivos por tarjeta. Lo más pesado va a la carpeta del proyecto y se pega el enlace en la descripción.",
        "• No se aceptan programas ni scripts (.exe, .bat, .ps1…).",
        "• Un archivo que ya está adjunto a la tarjeta no se sube otra vez, aunque tenga otro nombre.",
        "• **Quitar** un adjunto lo borra de verdad; en la Actividad queda quién lo subió y quién lo quitó.",
        "• Los adjuntos no viajan en las plantillas ni en el Excel.",
      ],
    },
    {
      id: "columnas",
      titulo: "Organizar las columnas",
      parrafos: [
        "Con **Añadir columna** (a la derecha) creas una nueva. En el menú «…» de cada columna puedes:",
        "• Renombrarla o archivarla (sus tarjetas pasan a otra columna).",
        "• **Marcarla como columna final**: sus tarjetas cuentan como terminadas.",
        "• Ponerle un **límite de tarjetas**: el contador se pone ámbar al llegar y rojo al pasarse. Solo avisa, no bloquea.",
        "• Incluirla en el Gantt o sacarla.",
        "Para reordenarlas, arrastra su encabezado. Esto lo hace quien gestiona el tablero (el dueño, o los administradores del equipo).",
      ],
    },
    {
      id: "etiquetas",
      titulo: "Etiquetas: clasificar las tarjetas",
      parrafos: [
        "Una **etiqueta** es una marca de color con nombre que le pones a una tarjeta para saber de un vistazo de qué se trata. Una tarjeta puede tener varias.",
        "Ejemplos de uso:",
        "• **Disciplina**: Civil, Mecánica, Eléctrica, Instrumentación.",
        "• **Cliente o proyecto**: Cliente A, Planta Norte, Ampliación.",
        "• **Tipo de trabajo o fase**: Ingeniería, Procura, Construcción.",
        "• **Estados que no son columnas**: Bloqueada, Espera cliente, Revisión interna.",
        "Para qué sirven: se ven como píldoras en el Tablero y en la Lista, y con el filtro **Etiquetas** ves solo, por ejemplo, lo de Mecánica. El filtro vale para las cuatro vistas y para exportar a Excel.",
        "Cómo se crean: en el menú «…» del tablero, **Etiquetas y campos…** (hasta 30 por tablero, cada una con su color). Luego, dentro de cada tarjeta, se marcan o desmarcan con un clic.",
        "**Etiqueta de hito**: en la misma pantalla, el botón **Hito** de una etiqueta hace que las tarjetas que la lleven se dibujen como un **rombo** en el Gantt y en su PDF (el cierre de una fase, una entrega). Se marca a mano: el nombre de la etiqueta no influye.",
        "Ojo: borrar una etiqueta la quita de todas las tarjetas que la tenían.",
      ],
    },
    {
      id: "campos",
      titulo: "Campos personalizados: datos propios del tablero",
      parrafos: [
        "Un **campo personalizado** es un dato extra que tu tablero necesita y que la tarjeta no trae de fábrica. Se define una vez para el tablero y cada tarjeta guarda su valor.",
        "Hay tres tipos:",
        "• **Texto**: N.º de plano o documento (PLN-CIV-0012), orden de compra, área o unidad.",
        "• **Número**: horas estimadas, monto, cantidad, % de avance reportado (acepta coma o punto).",
        "• **Lista**: una opción entre varias fijas, por ejemplo Etapa (Básica, Detalle, Construcción) o Revisión (A, B, 0, 1).",
        "Para qué sirven: se rellenan dentro de la tarjeta, cada campo tiene **su columna en la Lista** (ordenable: por ejemplo, de más a menos horas) y sale en el **Excel** exportado. Si lo pones en «Se ve en la tarjeta del tablero», su valor también aparece en el Kanban.",
        "Cómo se crean: en el menú «…» del tablero, **Etiquetas y campos…** (hasta 20 activos). El tipo no se puede cambiar después. Un campo no se borra: se **archiva** y conserva los valores que ya tenía.",
        "Las **opciones de una lista** se cargan una por fila: escribe una y pulsa Enter para seguir con la siguiente, o **pega varias de una vez** (una por línea, como una columna de Excel, o separadas por comas). Hasta 30 por lista.",
        "• Con las flechas cambias el **orden**: es el de los desplegables y el de los grupos del Gantt cuando agrupas por ese campo.",
        "• Si **renombras** una opción, las tarjetas que la tenían pasan al nombre nuevo.",
        "• Si **quitas** una opción que alguna tarjeta usa, esas tarjetas conservan el valor, pero ya no se puede elegir en otras.",
      ],
    },
    {
      id: "filtros",
      titulo: "Buscar y filtrar",
      parrafos: [
        "Arriba del tablero puedes buscar por título o por #número y filtrar por urgencia, responsables, etiquetas o **Vencidas o por vencer**.",
        "Los filtros valen para las cuatro vistas y para exportar: se exporta lo que ves.",
      ],
    },
    {
      id: "archivar",
      titulo: "Archivar (nada se borra)",
      parrafos: [
        "Abre la tarjeta y pulsa **Archivar tarjeta**: deja de verse, pero conserva todo su historial.",
        "Con **Archivadas** ves las tarjetas archivadas del tablero y puedes restaurarlas.",
      ],
    },
  ],
};

const LISTA: TemaAyuda = {
  id: "lista",
  etiqueta: "Lista",
  resumen: "Todas las tarjetas en una tabla: la vista para revisar fechas, responsables y avance de un vistazo.",
  entradas: [
    {
      id: "columnas",
      titulo: "Qué muestra cada columna",
      parrafos: [
        "Número, tarjeta, estado (su columna del tablero), responsables, urgencia, inicio, fin y avance del checklist.",
        "Si el tablero tiene campos propios, cada uno tiene su columna al final.",
        "En pantallas pequeñas algunas columnas se ocultan para que la tabla quepa.",
      ],
    },
    {
      id: "ordenar",
      titulo: "Ordenar",
      parrafos: [
        "Haz clic en el encabezado de una columna para ordenar por ella; otro clic invierte el orden.",
        "Las tarjetas sin fecha (o sin valor en un campo) quedan siempre al final.",
      ],
    },
    {
      id: "abrir",
      titulo: "Abrir y editar",
      parrafos: [
        "Haz clic en una fila (o Enter con el teclado) para abrir la tarjeta y cambiar lo que necesites.",
        "Para crear tarjetas usa el Tablero, el Calendario o el Gantt.",
      ],
    },
    {
      id: "exportar",
      titulo: "Llevar la lista a Excel",
      parrafos: [
        "Filtra lo que te interesa y pulsa **Excel / Project → Exportar a Excel**: el archivo trae exactamente lo que ves.",
      ],
    },
  ],
};

const CALENDARIO: TemaAyuda = {
  id: "calendario",
  etiqueta: "Calendario",
  resumen: "El mes con cada tarjeta como una barra desde su inicio hasta su fin. Útil para ver cómo se reparte el trabajo en el tiempo.",
  entradas: [
    {
      id: "crear",
      titulo: "Crear una tarea en un día",
      parrafos: [
        "Haz clic en un día vacío del calendario: se abre **Nueva tarea** con ese día como inicio y fin.",
        "Para una tarea de varios días, **arrastra sobre los días** que dura y suelta: se abre con esas fechas ya puestas.",
        "También puedes usar el botón **+ Tarea** de arriba.",
        "En el teléfono: toca el día y pulsa **Nueva tarea este día**.",
      ],
    },
    {
      id: "mover",
      titulo: "Cambiar la fecha de una tarjeta",
      parrafos: [
        "Arrastra su barra a otro día: se mueve entera y conserva su duración.",
        "Si otras tarjetas dependen de ella (flechas del Gantt), se corren también lo necesario.",
        "Para cambiar solo el inicio o solo el fin, abre la tarjeta o usa el Gantt.",
      ],
    },
    {
      id: "leer",
      titulo: "Cómo leerlo",
      parrafos: [
        "• El color del borde es la urgencia; las terminadas salen en verde y tachadas, las vencidas con el texto en rojo.",
        "• Una tarjeta con una sola fecha aparece solo ese día.",
        "• Si no caben todas, el día muestra **+N más**: haz clic para verlas.",
        "• Los feriados van en rojo con su nombre, y los fines de semana más claros.",
      ],
    },
    {
      id: "navegar",
      titulo: "Moverse entre meses",
      parrafos: ["Usa las flechas para ir al mes anterior o al siguiente, y **Hoy** para volver al mes actual."],
    },
  ],
};

const GANTT: TemaAyuda = {
  id: "gantt",
  etiqueta: "Gantt",
  resumen:
    "El plan en una línea de tiempo: cada tarea es una barra y las flechas dicen qué va después de qué. Aquí el equipo carga sus tareas y quien dirige sigue el avance.",
  entradas: [
    {
      id: "crear",
      titulo: "Cargar tareas",
      parrafos: [
        "Pulsa **+ Tarea**: título, responsable, inicio, fin y urgencia en un solo paso.",
        "**Crear y añadir otra** deja lista la siguiente, empezando el día hábil después de la anterior y con la misma duración: así cargas un plan completo seguido.",
      ],
    },
    {
      id: "sucesoras",
      titulo: "Tareas que van una después de otra",
      parrafos: [
        "Una **sucesora** es una tarea que no puede empezar hasta que termine otra (su predecesora). Las une una flecha. Para crearla:",
        "• Pasa el ratón sobre una tarea de la lista y pulsa **+**: la nueva empieza cuando esa termina.",
        "• En **+ Tarea**, elige **Empieza después de**.",
        "• Para enlazar dos que ya existen, arrastra desde el punto al final de una barra hasta la otra.",
        "Haz clic en una flecha para cambiar el tipo (fin → inicio, inicio → inicio, fin → fin), dejar días de espera o quitarla.",
      ],
    },
    {
      id: "mover",
      titulo: "Cambiar fechas en el Gantt",
      parrafos: [
        "Arrastra una barra para moverla entera, o sus bordes para cambiar solo el inicio o el fin. Mientras arrastras ves las fechas nuevas.",
        "Con **Mover sucesoras** activado, al retrasar una tarea las que dependen de ella se corren solas (en días hábiles) y conservan su duración. Desactivado, solo se mueve la que arrastras y las flechas que no se cumplan se ven en rojo punteado.",
      ],
    },
    {
      id: "ver",
      titulo: "Ver el plan como te sirva",
      parrafos: [
        "• **Día / Semana / Mes** cambian el zoom; **Encajar** elige el que muestra todas las tareas a la vez.",
        "• **Agrupar** por columna, responsable o urgencia. Por responsable ves cómo va cada persona.",
        "• Si el tablero tiene un **campo de tipo lista** (por ejemplo «Fase»), también puedes agrupar por él: un grupo por cada opción, en el orden de la lista, y al final las tarjetas que no lo tienen.",
        "• **Hoy** vuelve a la fecha actual; el botón de la esquina pone el Gantt en **pantalla completa** (Esc para salir).",
      ],
    },
    {
      id: "hitos",
      titulo: "Hitos: los rombos del Gantt",
      parrafos: [
        "Un **hito** marca un logro con fecha: el cierre de una fase, una entrega, una aprobación. En el Gantt y en su PDF se dibuja como un **rombo** en su último día, y en MS Project sale como hito.",
        "Una tarjeta es un hito cuando lleva una **etiqueta de hito**. Se marca en «…» → **Etiquetas y campos…**, con el botón **Hito** de la etiqueta. Las plantillas del programa ya traen la etiqueta «Hito» así.",
        "Filtrando por esa etiqueta el Gantt queda solo con los hitos: la vista para informar fechas.",
      ],
    },
    {
      id: "avance",
      titulo: "Seguir el avance",
      parrafos: [
        "La línea bajo la barra de herramientas dice el % terminado y cuántas tareas están vencidas o vencen pronto; al hacer clic en esos números se filtra lo atrasado.",
        "Cada grupo muestra hechas/total y una barra resumen con su tramo. Dentro de cada barra, la parte más oscura es el avance del checklist.",
      ],
    },
    {
      id: "sin-fechas",
      titulo: "Tareas sin fechas",
      parrafos: [
        "Las tareas del Gantt que aún no tienen inicio y fin esperan en **Sin fechas**. Ábrela y arrastra una tarjeta a la línea de tiempo para darle fecha.",
      ],
    },
    {
      id: "pdf",
      titulo: "Compartir el Gantt en PDF",
      parrafos: [
        "Pulsa **PDF** en la barra del Gantt (o **Excel / Project → Gantt en PDF…**). Sale un PDF para enviar o imprimir con el diagrama, el resumen de avance y la leyenda.",
        "Lleva lo que ves: los filtros, la agrupación y los grupos plegados. Al descargarlo eliges:",
        "• **Escala**: ajustada al ancho (todo el periodo en una hoja) o como en el Gantt (Día, Semana o Mes; un plan largo sigue en más hojas).",
        "• **Periodo**: todo el plan o de una fecha a otra.",
        "• **Hoja**: Carta u **11×17** (tabloide) para el plan grande, siempre horizontal.",
        "Las flechas se dibujan cuando las dos tareas caen en la misma hoja.",
      ],
    },
    {
      id: "project",
      titulo: "Llevar el plan a MS Project",
      parrafos: [
        "**Excel / Project → Exportar a MS Project** descarga un XML que Project abre con las tareas, fechas y dependencias. También puedes importar un XML de Project al tablero.",
      ],
    },
  ],
};

const PREGUNTAS: TemaAyuda = {
  id: "preguntas",
  etiqueta: "Preguntas frecuentes",
  resumen: "Lo que más se pregunta sobre tableros, equipos, avisos y fechas.",
  entradas: [
    {
      id: "personal",
      titulo: "¿Quién ve mi tablero personal?",
      parrafos: [
        "Solo tú. Ni siquiera el administrador del módulo puede verlo. Puedes tener varios tableros personales.",
      ],
    },
    {
      id: "etiqueta-o-campo",
      titulo: "¿Uso una etiqueta o un campo personalizado?",
      parrafos: [
        "• **Etiqueta** si quieres **clasificar y filtrar**: pocas categorías que se ven de un vistazo en el tablero (disciplina, cliente, «Bloqueada»). Una tarjeta puede tener varias.",
        "• **Campo** si quieres **guardar un dato** de cada tarjeta: un código, un número, una opción de una lista (N.º de plano, horas, etapa). Un valor por tarjeta, que puedes ordenar en la Lista y llevar a Excel.",
        "Ejemplo: «Mecánica» es una etiqueta; «Horas estimadas: 16» es un campo.",
        "Los dos se crean en el menú «…» del tablero, **Etiquetas y campos…**, y los gestiona quien administra el tablero (el dueño, o los administradores del equipo); cualquiera que edite tarjetas puede ponerlos. Viajan en las plantillas y, al mover una tarjeta a otro tablero, se conservan los que existan allí con el mismo nombre.",
      ],
    },
    {
      id: "favoritos",
      titulo: "¿Cómo tengo a mano los tableros que más uso?",
      parrafos: [
        "Márcalos como **favoritos** con la estrella: en su tarjeta de **Tableros** (aparece al pasar el ratón) o junto al nombre del tablero abierto.",
        "Los favoritos salen primero en **Tableros**. Son solo tuyos: nadie más ve cuáles marcaste.",
      ],
    },
    {
      id: "equipos",
      titulo: "¿Cómo creo un equipo? ¿Puedo estar en varios?",
      parrafos: [
        "En **Equipos → Nuevo equipo**. Quien lo crea queda como administrador. Puedes crear todos los que necesites y pertenecer a varios equipos a la vez.",
      ],
    },
    {
      id: "invitar",
      titulo: "¿Cómo agrego a alguien a mi equipo?",
      parrafos: [
        "Un administrador del equipo la invita desde la página del equipo, eligiendo su rol. La persona recibe un aviso y entra al aceptar la invitación en **Invitaciones**.",
        "Se puede invitar a quien aún no ha entrado a Planificación, siempre que tenga acceso al módulo en el Portal.",
      ],
    },
    {
      id: "roles",
      titulo: "¿Qué puede hacer cada rol?",
      parrafos: [
        "• **Administrador**: todo, más invitar, cambiar roles, crear tableros del equipo y gestionar columnas, etiquetas y campos.",
        "• **Miembro**: crea, edita y mueve tarjetas y comenta.",
        "• **Lector**: solo consulta.",
        "Un equipo siempre conserva al menos un administrador.",
      ],
    },
    {
      id: "solo-lectura",
      titulo: "¿Por qué no puedo editar un tablero?",
      parrafos: [
        "Porque eres lector en ese equipo, o porque el tablero o el equipo están archivados. Arriba del tablero lo verás como «Solo lectura».",
      ],
    },
    {
      id: "vencimientos",
      titulo: "¿Qué significan «vencida» y «vence pronto»?",
      parrafos: [
        "• **Vencida**: su fecha de fin ya pasó y no está en la columna final.",
        "• **Vence pronto**: le quedan pocos días hábiles (2, salvo que el Portal diga otro número).",
        "• **Terminada**: está en la columna final; nunca cuenta como vencida.",
        "Los responsables reciben un aviso cuando una tarjeta pasa a vencer pronto o a vencida.",
      ],
    },
    {
      id: "dias-habiles",
      titulo: "¿Qué cuenta como día hábil?",
      parrafos: [
        "De lunes a viernes, sin feriados. Los feriados nacionales ya vienen cargados (incluidos Carnaval y Semana Santa); el administrador del módulo puede añadir otros en **Calendario laboral**.",
      ],
    },
    {
      id: "no-gantt",
      titulo: "¿Por qué una tarjeta no aparece en el Gantt?",
      parrafos: [
        "Para tener barra necesita **inicio y fin**. Si le falta alguna, espera en **Sin fechas**.",
        "Además, su columna debe estar incluida en el Gantt (menú «…» de la columna) o la tarjeta debe tener «Gantt: Sí». El Gantt dice cuántas quedan fuera.",
      ],
    },
    {
      id: "avisos",
      titulo: "¿Cuándo recibo avisos?",
      parrafos: [
        "En la campana del Portal, cuando:",
        "• te hacen responsable de una tarjeta o te mencionan con @;",
        "• comentan en una tarjeta de la que eres responsable;",
        "• una tarjeta tuya vence pronto o se vence;",
        "• te invitan a un equipo, o responden a una invitación que enviaste.",
        "Nunca te avisa de lo que haces tú. Al hacer clic en el aviso se abre la tarjeta.",
      ],
    },
    {
      id: "mis-tareas",
      titulo: "¿Dónde veo todo lo que tengo asignado?",
      parrafos: ["En **Mis tareas**: las tarjetas de las que eres responsable en todos tus tableros, agrupadas por cuándo vencen."],
    },
    {
      id: "borrar",
      titulo: "¿Se puede borrar una tarjeta?",
      parrafos: [
        "No: se **archiva** (dentro de la tarjeta, **Archivar tarjeta**) y se puede restaurar desde **Archivadas**. Así nunca se pierde el historial.",
      ],
    },
    {
      id: "trasladar",
      titulo: "¿Cómo paso una tarjeta a otro tablero?",
      parrafos: [
        "Ábrela y usa **Mover a otro tablero**. De un tablero personal puede ir a otro tuyo o a uno de equipo; de uno de equipo, solo a otro de equipo.",
        "Viajan sus comentarios, checklist e historial; sus flechas del Gantt se pierden.",
      ],
    },
    {
      id: "conflicto",
      titulo: "¿Qué pasa si dos personas cambian la misma tarjeta?",
      parrafos: [
        "Si alguien la cambió mientras la tenías abierta, al guardar te avisa y te muestra la versión actual, para que no pises su cambio sin saberlo.",
      ],
    },
    {
      id: "excel",
      titulo: "¿Puedo cargar tarjetas desde Excel?",
      parrafos: [
        "Sí: **Excel / Project → Importar tarjetas…**. Descarga la plantilla, llénala y súbela (también acepta un XML de MS Project). Antes de crear nada ves cómo quedará cada tarjeta.",
      ],
    },
    {
      id: "plantillas",
      titulo: "¿Puedo reutilizar un tablero como modelo?",
      parrafos: [
        "Sí: en el menú «…» del tablero, **Guardar como plantilla…**. Al crear un tablero nuevo elige la plantilla en **Empezar con** y la fecha de inicio: las fechas se recalculan en días hábiles.",
      ],
    },
  ],
};

export const TEMAS: TemaAyuda[] = [TABLERO, LISTA, CALENDARIO, GANTT, PREGUNTAS];

/** Minúsculas y sin acentos: «calendário» encuentra «calendario». */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export type Resultado = { tema: TemaAyuda; entrada: EntradaAyuda };

/** Entradas cuyo título o texto contienen todas las palabras buscadas. */
export function buscar(consulta: string): Resultado[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const resultados: Resultado[] = [];
  for (const tema of TEMAS) {
    for (const entrada of tema.entradas) {
      const texto = normalizar(`${entrada.titulo} ${entrada.parrafos.join(" ")}`);
      if (palabras.every((p) => texto.includes(p))) resultados.push({ tema, entrada });
    }
  }
  return resultados;
}
