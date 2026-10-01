"""
Plantillas que trae el programa, escritas aquí y no sacadas de un tablero: así
quedan versionadas y salen iguales en cada instalación. Son la metodología de
trabajo del departamento (`docs/metodologia-de-trabajo.md`) llevada a tableros:
«Proyecto de software» y «Soporte». Cada una trae una tarjeta
inicial con la metodología y los primeros pasos, y su propia guía para el Centro de ayuda
(`guias.py`), que solo aparece en los tableros creados con ella.

«Proyecto de software»: el desarrollo por módulos.

- El **estado** son las columnas; «Pendientes» es el backlog y queda fuera del
  Gantt (lo que no está planificado no lleva fecha).
- La **fase** (Fase 0 y un módulo por fase) es el campo de lista «Fase».
- La **tarea** es la tarjeta y sus pasos van en el checklist.
- El **hito** que cierra cada fase es una tarjeta de un día con la etiqueta
  «Hito» (marcada `es_hito`: se dibuja como un rombo); filtrar por ella deja
  el Gantt solo con los hitos.

«Soporte»: incidencias, solicitudes y mantenimiento, sin Gantt (columnas
Entrada · En atención · Esperando · Resuelto). Es solo soporte: el día a día
del departamento que no viene de una solicitud no se lleva en este tablero.

Se instalan con `manage.py instalar_plantillas`: globales (para todo el
módulo) o, con `--equipo`, como plantillas de ese equipo (solo las ven sus
miembros y las gestionan sus administradores). Se reconocen por el nombre y el
alcance: la que ya existe no se vuelve a crear ni se pisa, salvo que se pida
actualizarla.
"""

from __future__ import annotations

from django.db import transaction

from plantillas.models import AlcancePlantilla, Plantilla
from plantillas.services.guias import GUIA_PROYECTO, GUIA_SOPORTE
from plantillas.services.plantillas import FORMATO

PROYECTO_SOFTWARE = "Proyecto de software"

FASE_0 = "Fase 0 · Configuración"
CIERRE = "Cierre"
MODULOS = 3

# Índices de las columnas del tablero.
PENDIENTES, PLANIFICADO = 0, 1

# Días hábiles que ocupa el bloque de un módulo (de documentarlo a su revisión).
DIAS_MODULO = 18


def _fase_modulo(n: int) -> str:
    return f"Fase {n} · Módulo {n}"


def _tarjeta(ref, titulo, *, fase, inicio, fin, etiquetas=(), descripcion="", checklist=(), depende=(), urgencia="media"):
    campos = {"Fase": fase}
    return {
        "ref": ref,
        "titulo": titulo,
        "descripcion": descripcion,
        "columna": PLANIFICADO,
        "urgencia": urgencia,
        "en_gantt": "heredar",
        "inicio": inicio,
        "fin": fin,
        "etiquetas": list(etiquetas),
        "campos": campos,
        "checklist": list(checklist),
        "depende": [[r, "fin_inicio", 0] for r in depende],
    }


def _fase_0() -> list[dict]:
    return [
        _tarjeta(
            1, "Documentación general del proyecto", fase=FASE_0, inicio=0, fin=2, etiquetas=["Documentación"],
            descripcion="Lo que todo el equipo debe saber antes de empezar. Vive en el repositorio (carpeta docs/), no en un archivo suelto.",
            checklist=[
                "Descripción general y propósito",
                "Público al que va dirigido",
                "Glosario de términos del negocio",
                "Lista de módulos, en orden de desarrollo",
                "Plataformas (web, escritorio, móvil)",
                "Tecnologías y lenguajes",
            ],
        ),
        _tarjeta(
            2, "Arquitectura del sistema", fase=FASE_0, inicio=3, fin=4, etiquetas=["Documentación"], depende=[1],
            checklist=["Piezas del sistema y cómo se comunican", "Modelo de datos inicial", "Roles y permisos", "Integración con el Portal"],
        ),
        _tarjeta(
            3, "Repositorio y entorno", fase=FASE_0, inicio=3, fin=4, etiquetas=["Desarrollo"], depende=[1],
            checklist=[
                "Repositorio creado, con main protegida y rama de trabajo",
                "Archivo de dependencias al día",
                "Variables de entorno de ejemplo, sin secretos",
                "Base de datos y primera migración",
                "Instrucciones para levantar el proyecto en local",
            ],
        ),
        _tarjeta(
            4, "Despliegue vacío", fase=FASE_0, inicio=5, fin=6, etiquetas=["Desarrollo"], depende=[2, 3],
            descripcion="El programa arranca, se inicia sesión y se publica, aunque todavía no haga nada.",
            checklist=["Estructura del proyecto", "Inicio de sesión", "Publicado en el servidor de pruebas"],
        ),
        _tarjeta(
            5, "Fase 0 aprobada", fase=FASE_0, inicio=7, fin=7, etiquetas=["Hito"], depende=[4], urgencia="alta",
            descripcion="Hito: la base está lista para empezar el primer módulo.",
            checklist=["Documentación general revisada por el equipo", "Todos levantan el proyecto en su máquina", "Despliegue vacío funcionando"],
        ),
    ]


def _modulo(n: int, *, inicio: int, tras: int) -> list[dict]:
    """Las seis tarjetas de un módulo. `tras`: ref del hito de la fase anterior."""
    fase = _fase_modulo(n)
    ref = n * 10
    historias = [
        _tarjeta(
            ref + h, f"M{n} · Historia de usuario {h}", fase=fase, etiquetas=["Desarrollo"], depende=[ref],
            inicio=inicio + 3 + 4 * (h - 1), fin=inicio + 6 + 4 * (h - 1),
            descripcion="Como [actor] quiero [acción] para [beneficio].\n\nCriterio de aceptación:\n- …",
            checklist=["Funcionalidad", "Pruebas", "Documentación del módulo al día"],
        )
        for h in (1, 2, 3)
    ]
    return [
        _tarjeta(
            ref, f"M{n} · Documentar el módulo", fase=fase, inicio=inicio, fin=inicio + 2, etiquetas=["Documentación"], depende=[tras],
            checklist=[
                "Propósito del módulo",
                "Actores y roles",
                "Historias de usuario con criterio de aceptación",
                "Requisitos funcionales y no funcionales",
                "Flujo de los usuarios",
                "Datos: tablas nuevas o cambiadas",
                "Bosquejos de las pantallas",
            ],
        ),
        *historias,
        _tarjeta(
            ref + 4, f"M{n} · Pruebas del módulo", fase=fase, inicio=inicio + 15, fin=inicio + 16, etiquetas=["Pruebas"],
            depende=[h["ref"] for h in historias],
            checklist=["Recorrido completo con cada rol", "Permisos: lo que cada rol no debe poder hacer", "En el teléfono", "Errores encontrados registrados en Pendientes"],
        ),
        _tarjeta(
            ref + 5, f"M{n} · Revisión del módulo", fase=fase, inicio=inicio + 17, fin=inicio + 17, etiquetas=["Hito"],
            depende=[ref + 4], urgencia="alta",
            descripcion=(
                "Hito: reunión de revisión con todo el equipo y los líderes del proyecto.\n\n"
                "Corrección menor: tarjeta nueva en esta fase. Corrección mayor (deja vieja la documentación): "
                "vuelve a «Documentar el módulo»."
            ),
            checklist=[
                "Demostración del módulo funcionando",
                "Criterios de aceptación de cada historia cumplidos",
                "Seguridad y permisos revisados",
                "Rendimiento aceptable con datos reales",
                "Documentación del módulo al día",
                "Cambios integrados en main",
            ],
        ),
    ]


def _cierre(*, inicio: int, tras: int) -> list[dict]:
    return [
        _tarjeta(
            90, "Paso a producción", fase=CIERRE, inicio=inicio, fin=inicio + 1, etiquetas=["Desarrollo"], depende=[tras],
            checklist=["Base de datos y respaldo", "Variables de entorno de producción", "Publicado y probado con una sesión real"],
        ),
        _tarjeta(
            91, "Manual y entrega a soporte", fase=CIERRE, inicio=inicio + 2, fin=inicio + 3, etiquetas=["Documentación"], depende=[90],
            checklist=["Manual de uso", "Qué hacer ante los fallos más probables", "Tablero de soporte creado"],
        ),
        _tarjeta(
            92, "Proyecto entregado", fase=CIERRE, inicio=inicio + 4, fin=inicio + 4, etiquetas=["Hito"], depende=[91], urgencia="alta",
            descripcion="Hito: en producción y en manos de soporte.",
        ),
    ]


_TUTORIAL_PROYECTO = {
    "ref": 0,
    "titulo": "Metodología del proyecto: léeme primero",
    "descripcion": (
        "Cómo se trabaja en este tablero, en simple. La guía con más detalle está en Ayuda → «Proyecto de "
        "software». Completa el checklist y archiva esta tarjeta cuando todo el equipo la haya leído.\n\n"
        "1. EL FLUJO DE DESARROLLO\n"
        "Fase 0 · Configuración → una fase por módulo → Cierre.\n"
        "Cada módulo va siempre igual: Documentar el módulo → Historias de usuario → Pruebas → Revisión (el hito).\n"
        "Cada tarea recorre las columnas: Pendientes → Planificado → En curso → En revisión → Hecho.\n\n"
        "2. CÓMO SE CARGA UNA TAREA\n"
        "- Con fecha: en el Gantt, «+ Tarea» (título, responsable, inicio y fin; «+ Fase» para elegir su fase). Para que vaya después de "
        "otra, el «+» de su fila o «Empieza después de»: toma la fase de la anterior.\n"
        "- Sin fecha todavía: en el Tablero, «Añadir tarjeta» en Pendientes; ábrela y ponle su Fase. El lunes se "
        "le pone fecha.\n"
        "- Ponle también su etiqueta (Desarrollo, Documentación o Pruebas). Sin fase cae en «Sin fase» en el Gantt.\n"
        "- Una tarjeta = algo que se entrega en 1 a 10 días hábiles. Los pasos van en su checklist.\n\n"
        "3. CÓMO SE ARMA CADA FASE\n"
        "Todas las tarjetas del módulo llevan la misma Fase y se encadenan:\n"
        "- Documentar el módulo (va después del hito anterior).\n"
        "- Una tarjeta por historia de usuario: depende de Documentar el módulo.\n"
        "- Pruebas del módulo: depende de todas las historias.\n"
        "- Revisión del módulo (etiqueta Hito): un día, depende de las pruebas.\n\n"
        "4. CÓMO FUNCIONAN LOS HITOS\n"
        "- Hay un hito por fase: la Revisión del módulo. Dura un día, el de la entrega del módulo, y en el Gantt "
        "es un rombo.\n"
        "- No se carga como una barra que cubra todo el módulo: el tramo completo de la fase lo muestra el Gantt "
        "con «Agrupar: Fase» (la barra resumen de cada fase con su avance).\n"
        "- Las tareas quedan unidas al hito por la misma Fase y por las dependencias. Si una tarea se atrasa "
        "(con «Mover sucesoras» activado), empuja al hito y el atraso de la entrega se ve.\n"
        "- Para cambiar la fecha de entrega se mueve el hito y se comenta el motivo.\n"
        "- En la reunión de revisión se recorre su checklist. Si se aprueba, pasa a Hecho y empieza la fase siguiente.\n\n"
        "5. LA FORMA CORRECTA DE USAR EL TABLERO\n"
        "- Pendientes: está identificada, sin fecha (fuera del Gantt). Lo nuevo de una fase en curso va aquí.\n"
        "- Planificado: ya tiene fecha y responsable.\n"
        "- En curso: el responsable la empezó.\n"
        "- En revisión: terminó; falta que otro la revise o la valide.\n"
        "- Hecho: cumple el criterio de aceptación y su documentación está al día.\n"
        "- La fecha de fin es un compromiso: si cambia, se mueve y se comenta el motivo.\n"
        "- Errores: etiqueta Error y a Pendientes; si detiene al equipo, Hotfix y directo a En curso.\n\n"
        "6. EL RITMO\n"
        "- Cada día: Mis tareas, mover las tarjetas y marcar el checklist.\n"
        "- Lunes: revisar lo vencido, pasar de Pendientes a Planificado lo de la semana, confirmar la fecha del "
        "próximo hito.\n"
        "- Viernes: Gantt en PDF agrupado por Fase.\n"
        "- Al cerrar el proyecto, el tablero se archiva."
    ),
    "columna": PENDIENTES,
    "urgencia": "alta",
    "en_gantt": "heredar",
    "inicio": None,
    "fin": None,
    "etiquetas": ["Documentación"],
    "campos": {},
    "checklist": [
        "Leer esta tarjeta (y la guía en Ayuda → «Proyecto de software»)",
        "Renombrar las fases con los módulos reales («…» → Etiquetas y campos → Fase)",
        "Archivar las tarjetas de los módulos que sobren",
        "Poner responsable a las tarjetas de la Fase 0",
        "Revisar en el Gantt («Agrupar: Fase») que cada hito tenga la fecha de entrega de su módulo",
        "Archivar esta tarjeta cuando todo el equipo la haya leído",
    ],
    "depende": [],
}


def contenido_proyecto_software() -> dict:
    tarjetas = [_TUTORIAL_PROYECTO, *_fase_0()]
    inicio, tras = 8, 5
    for n in range(1, MODULOS + 1):
        tarjetas += _modulo(n, inicio=inicio, tras=tras)
        inicio, tras = inicio + DIAS_MODULO, n * 10 + 5
    tarjetas += _cierre(inicio=inicio, tras=tras)
    return {
        "formato": FORMATO,
        "ayuda": GUIA_PROYECTO,
        "columnas": [
            {"nombre": "Pendientes", "es_final": False, "incluir_en_gantt": False, "limite_cards": None},
            {"nombre": "Planificado", "es_final": False, "incluir_en_gantt": True, "limite_cards": None},
            {"nombre": "En curso", "es_final": False, "incluir_en_gantt": True, "limite_cards": None},
            {"nombre": "En revisión", "es_final": False, "incluir_en_gantt": True, "limite_cards": None},
            {"nombre": "Hecho", "es_final": True, "incluir_en_gantt": True, "limite_cards": None},
        ],
        "etiquetas": [
            {"nombre": "Documentación", "color": "#2563eb"},
            {"nombre": "Desarrollo", "color": "#7c3aed"},
            {"nombre": "Pruebas", "color": "#0d9488"},
            {"nombre": "Hito", "color": "#d97706", "es_hito": True},
            {"nombre": "Error", "color": "#dc2626"},
            {"nombre": "Hotfix", "color": "#be123c"},
            {"nombre": "Cambio mayor", "color": "#db2777"},
            {"nombre": "Bloqueada", "color": "#64748b"},
        ],
        "campos": [
            {
                "nombre": "Fase",
                "tipo": "lista",
                "opciones": [FASE_0, *(_fase_modulo(n) for n in range(1, MODULOS + 1)), CIERRE],
                "visible_en_tarjeta": True,
                # La tarea que sigue a otra suele ser de su misma fase.
                "atajo_al_crear": True,
            },
        ],
        "tarjetas": tarjetas,
    }


# --- «Soporte» -------------------------------------------------------------------------

SOPORTE = "Soporte"

# Índice de su primera columna.
ENTRADA = 0


def _de_soporte(ref, titulo, *, columna, descripcion="", etiquetas=(), campos=None, checklist=(), urgencia="media"):
    return {
        "ref": ref,
        "titulo": titulo,
        "descripcion": descripcion,
        "columna": columna,
        "urgencia": urgencia,
        "en_gantt": "heredar",
        "inicio": None,
        "fin": None,
        "etiquetas": list(etiquetas),
        "campos": campos or {},
        "checklist": list(checklist),
        "depende": [],
    }


def contenido_soporte() -> dict:
    tutorial = _de_soporte(
        0,
        "Tutorial: cómo se trabaja en este tablero",
        columna=ENTRADA,
        urgencia="baja",
        descripcion=(
            "Aquí va lo que el departamento atiende sin ser un proyecto: lo que falla, lo que piden y el "
            "mantenimiento. Hay un solo tablero de soporte y no se archiva. Lee esto una vez, completa los "
            "primeros pasos del checklist y archiva esta tarjeta. La guía completa está en Ayuda → «Soporte».\n\n"
            "QUÉ ENTRA\n"
            "- Incidencia: algo que funcionaba y falló.\n"
            "- Solicitud: alguien pide algo nuevo o un cambio pequeño.\n"
            "- Mantenimiento: trabajo preventivo o programado (respaldos, actualizaciones, equipos).\n\n"
            "COLUMNAS\n"
            "- Entrada: llegó y nadie lo ha tomado.\n"
            "- En atención: alguien lo está haciendo (tiene responsable). Lleva un límite de tarjetas: si se pasa, "
            "se está empezando más de lo que se termina.\n"
            "- Esperando: no depende del departamento; falta una respuesta del usuario o de un tercero. Se pasa "
            "aquí con un comentario que diga qué se espera y de quién.\n"
            "- Resuelto: se entregó y el solicitante lo sabe.\n\n"
            "CAMPOS\n"
            "- Sistema: a qué sistema o área pertenece.\n"
            "- Solicitante: quién lo pidió, para avisarle al resolver.\n\n"
            "URGENCIA\n"
            "- Crítica: algo está detenido; se atiende de inmediato.\n"
            "- Alta: afecta a varias personas o tiene una fecha cercana; hoy o mañana.\n"
            "- Media: trabajo normal.\n"
            "- Baja: cuando haya hueco.\n\n"
            "REGLAS\n"
            "- Todo lo que se atiende se registra, aunque se resuelva en diez minutos.\n"
            "- Solo lleva fechas lo que tiene día fijado. Este tablero no usa el Gantt: se sigue con el Tablero y, "
            "para lo que tiene fecha, el Calendario.\n"
            "- Si algo necesita más de 10 días hábiles o varias entregas, deja de ser soporte: se traslada al "
            "tablero de su proyecto o se abre uno.\n\n"
            "RITMO\n"
            "- Cada día: registrar lo que llega y mover las tarjetas.\n"
            "- Lunes: revisar Entrada, lo vencido y lo que lleva más de una semana en Esperando.\n"
            "- Viernes: archivar lo resuelto de la semana."
        ),
        checklist=[
            "Ajustar las opciones del campo «Sistema» («…» → Etiquetas y campos)",
            "Poner el límite de tarjetas de «En atención» (menú de la columna; sugerido: dos por persona)",
            "Marcar el tablero como favorito",
            "Archivar el ejemplo y esta tarjeta",
        ],
    )
    ejemplo = _de_soporte(
        1,
        "Ejemplo · La impresora de Administración no imprime",
        columna=ENTRADA,
        urgencia="alta",
        etiquetas=["Incidencia"],
        campos={"Sistema": "Equipos y red", "Solicitante": "Administración"},
        descripcion="Ejemplo de una incidencia recién llegada: qué pasa, desde cuándo y a quién afecta. Archívame.",
    )
    sin_gantt = {"es_final": False, "incluir_en_gantt": False, "limite_cards": None}
    return {
        "formato": FORMATO,
        "ayuda": GUIA_SOPORTE,
        "columnas": [
            {"nombre": "Entrada", **sin_gantt},
            {"nombre": "En atención", **sin_gantt},
            {"nombre": "Esperando", **sin_gantt},
            {"nombre": "Resuelto", **sin_gantt, "es_final": True},
        ],
        "etiquetas": [
            {"nombre": "Incidencia", "color": "#dc2626"},
            {"nombre": "Solicitud", "color": "#2563eb"},
            {"nombre": "Mantenimiento", "color": "#0d9488"},
        ],
        "campos": [
            {
                "nombre": "Sistema",
                "tipo": "lista",
                "opciones": ["Portal", "Nómina", "Hoja de Tiempo", "Planificación", "Equipos y red", "Otro"],
                "visible_en_tarjeta": True,
            },
            {"nombre": "Solicitante", "tipo": "texto", "opciones": [], "visible_en_tarjeta": True},
        ],
        "tarjetas": [tutorial, ejemplo],
    }


PLANTILLAS = [
    {
        "nombre": PROYECTO_SOFTWARE,
        "descripcion": (
            "Desarrollo por módulos: Fase 0 de configuración, una fase por módulo (documentar, historias de "
            "usuario, pruebas y revisión) y cierre. La fase va en el campo «Fase» y cada cierre lleva la etiqueta «Hito»."
        ),
        "contenido": contenido_proyecto_software,
    },
    {
        "nombre": SOPORTE,
        "descripcion": (
            "Un solo tablero para lo que el departamento atiende sin ser un proyecto: incidencias, "
            "solicitudes y mantenimiento. Sin Gantt."
        ),
        "contenido": contenido_soporte,
    },
]


@transaction.atomic
def instalar(*, actualizar: bool = False, equipo=None) -> dict[str, list[str]]:
    """Crea las plantillas del sistema que falten: globales, o del `equipo` si
    se indica. Con `actualizar`, además repone la descripción y el contenido
    de las que ya existen (los tableros creados con ellas no cambian)."""
    alcance = AlcancePlantilla.EQUIPO if equipo else AlcancePlantilla.GLOBAL
    resultado: dict[str, list[str]] = {"creadas": [], "actualizadas": [], "sin_cambios": []}
    for definicion in PLANTILLAS:
        nombre, descripcion, contenido = definicion["nombre"], definicion["descripcion"], definicion["contenido"]()
        existente = Plantilla.objects.filter(alcance=alcance, equipo=equipo, nombre=nombre).first()
        if existente is None:
            Plantilla.objects.create(nombre=nombre, descripcion=descripcion, alcance=alcance, equipo=equipo, contenido=contenido)
            resultado["creadas"].append(nombre)
        elif actualizar:
            existente.descripcion, existente.contenido = descripcion, contenido
            existente.save()
            resultado["actualizadas"].append(nombre)
        else:
            resultado["sin_cambios"].append(nombre)
    return resultado
