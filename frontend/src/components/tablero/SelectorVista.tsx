import { CalendarDays, ChartGantt, List, SquareKanban } from "lucide-react";
import { motion } from "motion/react";
import { Tooltip } from "radix-ui";

import { cn } from "@/lib/cn";

const VISTAS = [
  { id: "tablero", etiqueta: "Tablero", icono: SquareKanban, lista: true },
  { id: "lista", etiqueta: "Lista", icono: List, lista: false },
  { id: "calendario", etiqueta: "Calendario", icono: CalendarDays, lista: false },
  { id: "gantt", etiqueta: "Gantt", icono: ChartGantt, lista: false },
] as const;

/** Vistas del mismo tablero. Lista, Calendario y Gantt llegan en la fase 3
 *  (docs/plan-modulo-planificacion.md §7): se muestran para anticiparlas. */
export function SelectorVista() {
  const activa = "tablero";
  return (
    <div className="flex items-center gap-1 rounded-xl border border-linea bg-white p-1" role="tablist">
      {VISTAS.map(({ id, etiqueta, icono: Icono, lista }) => {
        const boton = (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === activa}
            disabled={!lista}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              id === activa ? "text-white" : "text-tenue",
              !lista && "cursor-not-allowed opacity-55",
            )}
          >
            {id === activa && (
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
        if (lista) return boton;
        return (
          <Tooltip.Root key={id} delayDuration={150}>
            <Tooltip.Trigger asChild>
              <span>{boton}</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                sideOffset={6}
                className="flotante z-[60] rounded-lg bg-marino px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
              >
                {etiqueta}: próximamente (fase 3)
                <Tooltip.Arrow className="fill-marino" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        );
      })}
    </div>
  );
}
