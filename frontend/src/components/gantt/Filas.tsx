/** Filas del Gantt: etiqueta de la tarjeta (izquierda) y su barra (línea de tiempo). */

import { CircleCheck } from "lucide-react";
import { memo, type PointerEvent as ReactPointerEvent } from "react";

import type { CardResumen } from "@/api/tipos";
import { PilaAvatares } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { URGENCIAS } from "@/lib/estilos";
import { rangoCorto } from "@/lib/fechas";
import { ALTO_BARRA, ALTO_FILA, type Fila } from "@/lib/gantt";

import type { Modo } from "./tipos";

type FilaCard = Extract<Fila, { tipo: "card" }>;

/** Misma tarjeta (mismo objeto: no cambió) en la misma altura. */
const mismaFila = (a: FilaCard, b: FilaCard) => a.card === b.card && a.y === b.y;

export const EtiquetaCard = memo(function EtiquetaCard({
  fila,
  onAbrir,
  resaltada,
  onResaltar,
}: {
  fila: Extract<Fila, { tipo: "card" }>;
  onAbrir: (c: CardResumen) => void;
  resaltada: boolean;
  onResaltar: (id: number | null) => void;
}) {
  const { card } = fila;
  const terminada = card.vencimiento === "terminada";
  return (
    <button
      type="button"
      onClick={() => onAbrir(card)}
      onPointerEnter={() => onResaltar(card.id)}
      onPointerLeave={() => onResaltar(null)}
      className={cn(
        "absolute inset-x-0 flex items-center gap-2 border-b border-linea/40 px-3 text-left transition-colors",
        resaltada ? "bg-morado/[0.06]" : "hover:bg-morado/[0.04]",
      )}
      style={{ top: fila.y, height: ALTO_FILA }}
    >
      <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: URGENCIAS[card.urgencia].color }} />
      {terminada && <CircleCheck className="size-3.5 shrink-0 text-[#059669]" />}
      <span className={cn("min-w-0 flex-1 truncate text-[0.82rem] font-medium text-texto", terminada && "text-tenue line-through decoration-tenue/40")}>
        {card.titulo}
      </span>
      <span className="hidden sm:block">
        <PilaAvatares personas={card.responsables} max={2} />
      </span>
    </button>
  );
},
(a, b) => mismaFila(a.fila, b.fila) && a.resaltada === b.resaltada && a.onAbrir === b.onAbrir && a.onResaltar === b.onResaltar);

export const Barra = memo(function Barra({
  fila,
  caja,
  puede,
  arrastrando,
  destinoEnlace,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onConector,
  onConectorMove,
  onConectorUp,
  onResaltar,
  onAbrir,
}: {
  fila: Extract<Fila, { tipo: "card" }>;
  caja: { x1: number; x2: number; y: number };
  puede: boolean;
  arrastrando: boolean;
  destinoEnlace: boolean;
  onPointerDown: (e: ReactPointerEvent, card: CardResumen, modo: Modo) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onConector: (e: ReactPointerEvent, card: CardResumen) => void;
  onConectorMove: (e: ReactPointerEvent) => void;
  onConectorUp: (e: ReactPointerEvent) => void;
  onResaltar: (id: number | null) => void;
  onAbrir: (c: CardResumen) => void;
}) {
  const { card } = fila;
  const color = URGENCIAS[card.urgencia].color;
  const terminada = card.vencimiento === "terminada";
  const vencida = card.vencimiento === "vencida";
  const ancho = Math.max(caja.x2 - caja.x1 - 4, 8);
  const cabeTitulo = ancho > 70;
  const avance = card.checklist.total ? card.checklist.hechos / card.checklist.total : terminada ? 1 : 0;
  const base = terminada ? "#059669" : color;

  return (
    <div
      className="group absolute z-[6]"
      style={{
        left: caja.x1 + 2,
        top: fila.y + (ALTO_FILA - ALTO_BARRA) / 2,
        width: ancho,
        height: ALTO_BARRA,
        transition: arrastrando ? "none" : "left 0.35s cubic-bezier(0.22,1,0.36,1), width 0.35s cubic-bezier(0.22,1,0.36,1)",
      }}
      onPointerEnter={() => onResaltar(card.id)}
      onPointerLeave={() => onResaltar(null)}
    >
      <div
        data-card-id={card.id}
        role="button"
        tabIndex={0}
        aria-label={`${card.titulo}, ${rangoCorto(card.fecha_inicio, card.fecha_fin)}`}
        onKeyDown={(e) => e.key === "Enter" && onAbrir(card)}
        onPointerDown={(e) => onPointerDown(e, card, "mover")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={cn(
          "relative flex h-full touch-none items-center overflow-hidden rounded-lg border pointer-coarse:touch-auto text-[0.72rem] font-semibold whitespace-nowrap shadow-[0_3px_8px_-5px_rgba(20,22,68,0.55)] transition-shadow",
          puede ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          "hover:shadow-[0_8px_18px_-10px_rgba(20,22,68,0.7)] focus-visible:ring-2 focus-visible:ring-morado/50 focus-visible:outline-none",
          arrastrando && "shadow-[0_14px_28px_-12px_rgba(20,22,68,0.75)] ring-2 ring-morado/40",
          destinoEnlace && "ring-2 ring-morado/30 ring-offset-1",
        )}
        style={{
          background: `color-mix(in srgb, ${base} 16%, #fff)`,
          borderColor: vencida ? "#dc2626" : `color-mix(in srgb, ${base} 45%, #fff)`,
          color: terminada ? "#047857" : "#141644",
        }}
      >
        <span className="absolute inset-y-0 left-0" style={{ width: `${avance * 100}%`, background: `color-mix(in srgb, ${base} 30%, #fff)` }} />
        {cabeTitulo && <span className="relative truncate px-2">{card.titulo}</span>}
        {puede && (
          <>
            <span
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:hidden"
              onPointerDown={(e) => onPointerDown(e, card, "inicio")}
            >
              <span className="absolute inset-y-1.5 left-0.5 w-0.5 rounded-full bg-marino/40" />
            </span>
            <span
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:hidden"
              onPointerDown={(e) => onPointerDown(e, card, "fin")}
            >
              <span className="absolute inset-y-1.5 right-0.5 w-0.5 rounded-full bg-marino/40" />
            </span>
          </>
        )}
      </div>

      {!cabeTitulo && (
        <span className="pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 text-[0.72rem] font-medium whitespace-nowrap text-texto">
          {card.titulo}
        </span>
      )}

      {arrastrando && (
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-md bg-marino px-2 py-1 text-[0.68rem] font-semibold whitespace-nowrap text-white shadow-lg">
          {rangoCorto(card.fecha_inicio, card.fecha_fin)}
        </span>
      )}

      {puede && (
        <span
          role="button"
          aria-label={`Enlazar «${card.titulo}» con otra tarjeta`}
          title="Arrastra hasta la tarjeta que debe ir después"
          onPointerDown={(e) => onConector(e, card)}
          onPointerMove={onConectorMove}
          onPointerUp={onConectorUp}
          className={cn(
            "absolute top-1/2 -right-3.5 size-3 -translate-y-1/2 cursor-crosshair touch-none rounded-full border-2 border-white bg-morado shadow pointer-coarse:hidden",
            "opacity-0 transition-[opacity,transform] group-hover:opacity-100 hover:scale-125",
          )}
        />
      )}
    </div>
  );
},
(a, b) =>
  mismaFila(a.fila, b.fila) &&
  a.caja.x1 === b.caja.x1 &&
  a.caja.x2 === b.caja.x2 &&
  a.caja.y === b.caja.y &&
  a.puede === b.puede &&
  a.arrastrando === b.arrastrando &&
  a.destinoEnlace === b.destinoEnlace &&
  a.onPointerDown === b.onPointerDown &&
  a.onPointerMove === b.onPointerMove &&
  a.onPointerUp === b.onPointerUp &&
  a.onPointerCancel === b.onPointerCancel &&
  a.onConector === b.onConector &&
  a.onConectorMove === b.onConectorMove &&
  a.onConectorUp === b.onConectorUp &&
  a.onResaltar === b.onResaltar &&
  a.onAbrir === b.onAbrir);
