/**
 * Bandeja «Sin fechas»: tarjetas del Gantt que aún no tienen inicio y fin.
 * Es un panel plegable que flota sobre la línea de tiempo (se abre desde la
 * barra de herramientas): antes era una columna fija que le quitaba ~260 px
 * al Gantt aunque hubiera una sola tarjeta.
 */

import { CalendarX2, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import type { CardResumen } from "@/api/tipos";
import { cn } from "@/lib/cn";
import { URGENCIAS } from "@/lib/estilos";

import type { Colocando } from "./tipos";

/** Botón de la barra de herramientas que abre y cierra la bandeja. */
export function BotonBandeja({ total, abierta, onAlternar }: { total: number; abierta: boolean; onAlternar: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={abierta}
      aria-label={`Sin fechas: ${total}`}
      onClick={onAlternar}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.82rem] font-medium transition-colors pointer-coarse:h-10",
        abierta ? "border-morado/40 bg-morado/8 text-morado" : "border-linea bg-white text-texto hover:border-morado/40",
      )}
    >
      <CalendarX2 className="size-4" />
      <span className="max-sm:hidden">Sin fechas</span>
      <span className="rounded-full bg-[#fef3c7] px-1.5 text-[0.7rem] font-bold text-[#b45309] tabular-nums">{total}</span>
    </button>
  );
}

export function Bandeja({
  cards,
  puede,
  colocando,
  onCerrar,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  cards: CardResumen[];
  puede: boolean;
  colocando: Colocando | null;
  onCerrar: () => void;
  onPointerDown: (e: ReactPointerEvent, card: CardResumen) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: () => void;
}) {
  // Mientras se arrastra una tarjeta el panel se vuelve transparente para
  // dejar ver la línea de tiempo. No se desmonta: perdería la captura del puntero.
  const arrastrando = colocando?.movido === true;
  return (
    <aside
      className={cn(
        "absolute top-2 right-2 bottom-2 z-40 flex w-64 max-w-[calc(100%-1rem)] flex-col rounded-2xl border border-linea bg-white/97 p-3 shadow-[0_24px_48px_-20px_rgba(20,22,68,0.5)] backdrop-blur-sm transition-opacity duration-150",
        "animate-rise",
        arrastrando && "opacity-0",
      )}
    >
      <h4 className="mb-1 flex items-center gap-1.5 text-[0.72rem] font-bold tracking-[0.08em] text-tenue uppercase">
        Sin fechas
        <span className="rounded-full bg-columna px-1.5 text-[0.68rem] tabular-nums">{cards.length}</span>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la bandeja"
          className="-mr-1 ml-auto rounded-md p-1 text-tenue hover:bg-fondo hover:text-marino pointer-coarse:p-2"
        >
          <X className="size-4" />
        </button>
      </h4>
      <p className="mb-3 text-xs text-tenue">
        {puede ? (
          <>
            <span className="pointer-coarse:hidden">Arrastra una tarjeta a la línea de tiempo para darle fecha.</span>
            <span className="hidden pointer-coarse:inline">Toca una tarjeta para ponerle fechas.</span>
          </>
        ) : (
          "Estas tarjetas aún no tienen inicio y fin."
        )}
      </p>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {cards.map((card) => {
          const activa = colocando?.card.id === card.id && colocando.movido;
          return (
            <li
              key={card.id}
              role="button"
              tabIndex={0}
              onPointerDown={(e) => onPointerDown(e, card)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              className={cn(
                "flex touch-none items-center gap-2 rounded-xl pointer-coarse:touch-auto border border-linea bg-white px-2.5 py-2 text-[0.8rem] font-medium text-texto transition-all select-none",
                puede ? "cursor-grab hover:border-morado/40 hover:shadow-sm" : "cursor-pointer hover:border-morado/40",
                activa && "opacity-40",
              )}
            >
              <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: URGENCIAS[card.urgencia].color }} />
              <span className="min-w-0 flex-1 truncate">{card.titulo}</span>
              <span className="text-[0.68rem] text-tenue/60">#{card.numero}</span>
            </li>
          );
        })}
      </ul>
      {/* En un portal: el panel se vuelve transparente y su `transform` (animación
          de entrada) rompería el `fixed`. */}
      {arrastrando &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border border-morado/30 bg-white px-3 py-2 text-[0.8rem] font-semibold text-marino shadow-[0_18px_36px_-14px_rgba(20,22,68,0.6)]"
            style={{ left: colocando.x, top: colocando.y }}
          >
            <span className="h-4 w-[3px] rounded-full" style={{ background: URGENCIAS[colocando.card.urgencia].color }} />
            {colocando.card.titulo}
          </div>,
          document.body,
        )}
    </aside>
  );
}
