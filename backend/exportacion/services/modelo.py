"""Una fila leída de un archivo (Excel o MS Project), antes de validarla."""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field


@dataclass
class FilaEntrada:
    #: Número de fila (Excel) o de tarea (Project), para los mensajes.
    fila: int
    titulo: str
    #: Identificador dentro del archivo: lo usan las dependencias («Depende de»).
    ref: int | None = None
    descripcion: str = ""
    columna: str = ""
    urgencia: str = ""
    inicio: datetime.date | None = None
    fin: datetime.date | None = None
    responsables: list[str] = field(default_factory=list)
    #: (ref de la predecesora, tipo, desfase en días hábiles)
    depende: list[tuple[int, str, int]] = field(default_factory=list)
    #: Terminada en el origen (Project al 100 %): va a la columna final.
    completada: bool = False
    #: Nombres de etiquetas del tablero (fase 5).
    etiquetas: list[str] = field(default_factory=list)
    #: Valores de campos personalizados por nombre del campo (fase 5).
    campos: dict[str, object] = field(default_factory=dict)
    errores: list[str] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
