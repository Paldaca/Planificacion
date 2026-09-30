"""
Plantillas que trae el programa (globales), escritas aquí y no sacadas de un
tablero: así quedan versionadas y salen iguales en cada instalación.

Por ahora una: «Proyecto de software», la metodología de desarrollo por
módulos del departamento llevada a tarjetas, sin nada nuevo en el programa:

- El **estado** son las columnas; «Pendientes» es el backlog y queda fuera del
  Gantt (lo que no está planificado no lleva fecha).
- La **fase** (Fase 0 y un módulo por fase) es el campo de lista «Fase».
- La **tarea** es la tarjeta y sus pasos van en el checklist.
- El **hito** que cierra cada fase es una tarjeta de un día con la etiqueta
  «Hito»: filtrar por ella deja el Gantt solo con los hitos.

Se instalan con `manage.py instalar_plantillas`. Se reconocen por el nombre:
una plantilla global con ese nombre no se vuelve a crear ni se pisa, salvo que
se pida actualizarla.
"""

from __future__ import annotations

from django.db import transaction

from plantillas.models import AlcancePlantilla, Plantilla
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


def _tarjeta(ref, titulo, *, fase, inicio, fin, etiquetas=(), descripcion="", checklist=(), depende=(), requisito="", urgencia="media"):
    campos = {"Fase": fase}
    if requisito:
        campos["Requisito"] = requisito
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
            inicio=inicio + 3 + 4 * (h - 1), fin=inicio + 6 + 4 * (h - 1), requisito=f"HU-{n}.{h}",
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


_LEEME = {
    "ref": 0,
    "titulo": "Cómo se usa este tablero (léeme y archívame)",
    "descripcion": (
        "Este tablero sigue la metodología de proyectos de software.\n\n"
        "- «Pendientes» es la lista de todo lo que falta por planificar: sin fecha y fuera del Gantt. "
        "Lo nuevo que aparezca a mitad de una fase va aquí.\n"
        "- Una tarjeta es algo que se entrega en 1 a 10 días hábiles. Los pasos van en el checklist.\n"
        "- Cada tarjeta lleva su «Fase». Renombra las opciones con el nombre real de cada módulo "
        "(menú «…» → Etiquetas y campos) y archiva las fases que sobren.\n"
        "- «Requisito» dice qué historia de usuario cubre la tarjeta.\n"
        "- La fecha de fin es un compromiso: si cambia, se mueve y se comenta el motivo.\n"
        "- Filtra por la etiqueta «Hito» para ver solo los cierres de fase.\n"
        "- Error menor: tarjeta en «Pendientes» con la etiqueta «Error». Error que detiene al equipo: "
        "etiqueta «Hotfix», urgencia crítica y directo a «En curso»."
    ),
    "columna": PENDIENTES,
    "urgencia": "baja",
    "en_gantt": "heredar",
    "inicio": None,
    "fin": None,
    "etiquetas": [],
    "campos": {},
    "checklist": [],
    "depende": [],
}


def contenido_proyecto_software() -> dict:
    tarjetas = [_LEEME, *_fase_0()]
    inicio, tras = 8, 5
    for n in range(1, MODULOS + 1):
        tarjetas += _modulo(n, inicio=inicio, tras=tras)
        inicio, tras = inicio + DIAS_MODULO, n * 10 + 5
    tarjetas += _cierre(inicio=inicio, tras=tras)
    return {
        "formato": FORMATO,
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
            {"nombre": "Hito", "color": "#d97706"},
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
            },
            {"nombre": "Requisito", "tipo": "texto", "opciones": [], "visible_en_tarjeta": True},
            {"nombre": "Rama", "tipo": "texto", "opciones": [], "visible_en_tarjeta": False},
        ],
        "tarjetas": tarjetas,
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
]


@transaction.atomic
def instalar(*, actualizar: bool = False) -> dict[str, list[str]]:
    """Crea las plantillas del sistema que falten. Con `actualizar`, además
    repone la descripción y el contenido de las que ya existen (los tableros
    creados con ellas no cambian)."""
    resultado: dict[str, list[str]] = {"creadas": [], "actualizadas": [], "sin_cambios": []}
    for definicion in PLANTILLAS:
        nombre, descripcion, contenido = definicion["nombre"], definicion["descripcion"], definicion["contenido"]()
        existente = Plantilla.objects.filter(alcance=AlcancePlantilla.GLOBAL, nombre=nombre).first()
        if existente is None:
            Plantilla.objects.create(nombre=nombre, descripcion=descripcion, alcance=AlcancePlantilla.GLOBAL, contenido=contenido)
            resultado["creadas"].append(nombre)
        elif actualizar:
            existente.descripcion, existente.contenido = descripcion, contenido
            existente.save()
            resultado["actualizadas"].append(nombre)
        else:
            resultado["sin_cambios"].append(nombre)
    return resultado
