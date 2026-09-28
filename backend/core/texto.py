"""Comparar nombres como lo hace MySQL (colación `utf8mb4_0900_ai_ci`).

Esa colación ignora mayúsculas y acentos («Área» = «area»); SQLite no
(`iexact` solo ignora mayúsculas en ASCII). Las reglas de «nombre único»
(etiquetas, campos personalizados) se comprueban en Python con esta clave para
que den lo mismo en desarrollo (SQLite) y en producción (MySQL).
"""

from __future__ import annotations

import re
import unicodedata


def clave_nombre(texto: str) -> str:
    """Sin acentos, sin mayúsculas y con los espacios colapsados."""
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFKD", texto or "") if not unicodedata.combining(c)
    )
    return re.sub(r"\s+", " ", sin_acentos).strip().casefold()
