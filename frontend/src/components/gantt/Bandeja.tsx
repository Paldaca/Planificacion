/** Bandeja «Sin fechas»: tarjetas del Gantt que aún no tienen inicio y fin. */

import { type PointerEvent as ReactPointerEvent } from "react";

import type { CardResumen } from "@/api/tipos";
import { cn } from "@/lib/cn";
import { URGENCIAS } from "@/lib/estilos";

import type { Colocando } from "./tipos";

export function Bandeja({
  cards,
  puede,
  colocando,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  cards: CardResumen[];
  puede: boolean;
  colocando: Colocando | null;
  onPointerDown: (e: ReactPointerEvent, card: CardResumen) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: () => void;
}) {
  return (
    <aside className="self-start rounded-2xl border border-linea bg-white p-3 shadow-[0_18px_40px_-32px_rgba(20,22,68,0.45)] lg:sticky lg:top-4">
      <h4 className="mb-1 flex items-center gap-1.5 text-[0.72rem] font-bold tracking-[0.08em] text-tenue uppercase">
        Sin fechas
        <span className="ml-auto rounded-full bg-columna px-1.5 text-[0.68rem] tabular-nums">{cards.length}</span>
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
      <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
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
      {colocando?.movido && (
        <div
          className="pointer-events-none fixed z-[70] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border border-morado/30 bg-white px-3 py-2 text-[0.8rem] font-semibold text-marino shadow-[0_18px_36px_-14px_rgba(20,22,68,0.6)]"
          style={{ left: colocando.x, top: colocando.y }}
        >
          <span className="h-4 w-[3px] rounded-full" style={{ background: URGENCIAS[colocando.card.urgencia].color }} />
          {colocando.card.titulo}
        </div>
      )}
    </aside>
  );
}
