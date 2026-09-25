import { CalendarDays, ChartGantt, List, SquareKanban } from "lucide-react";
import { motion } from "motion/react";

import type { Vista } from "@/api/tipos";
import { cn } from "@/lib/cn";

const VISTAS = [
  { id: "tablero", etiqueta: "Tablero", icono: SquareKanban },
  { id: "lista", etiqueta: "Lista", icono: List },
  { id: "calendario", etiqueta: "Calendario", icono: CalendarDays },
  { id: "gantt", etiqueta: "Gantt", icono: ChartGantt },
] as const;

/** Las cuatro formas de ver el MISMO tablero (mismos datos, mismos permisos). */
export function SelectorVista({ vista, onCambio }: { vista: Vista; onCambio: (vista: Vista) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-linea bg-white p-1" role="tablist" aria-label="Vista del tablero">
      {VISTAS.map(({ id, etiqueta, icono: Icono }) => {
        const activa = id === vista;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activa}
            title={etiqueta}
            onClick={() => !activa && onCambio(id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              activa ? "text-white" : "text-tenue hover:text-morado",
            )}
          >
            {activa && (
              <motion.span
                layoutId="vista-activa"
                className="absolute inset-0 rounded-lg bg-morado shadow-[0_6px_14px_-8px_rgba(50,64,123,0.8)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <Icono className="relative size-3.5" />
            <span className="relative hidden sm:inline">{etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
