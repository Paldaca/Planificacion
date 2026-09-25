"""
Señales que emite `tableros` para apps que dependen de ella.

`tableros` no importa a quien las escucha (p. ej. `gantt`): así la dependencia
entre apps va en un solo sentido (docs/plan-modulo-planificacion.md §3.1).
"""

from django.dispatch import Signal

#: La card cambió de tablero. Argumentos: `card`, `origen` (Tablero).
tarjeta_trasladada = Signal()
