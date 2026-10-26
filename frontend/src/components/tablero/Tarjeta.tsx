import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, CircleCheck, Hourglass, ListChecks, Maximize2, MessageSquare, Paperclip, TextAlignStart } from "lucide-react";
import { memo, type CSSProperties } from "react";

import { urlImagen } from "@/api/adjuntos";
import type { CardResumen } from "@/api/tipos";
import { PilaAvatares } from "@/components/ui/Avatar";
import { textoValor, useConfigTablero } from "@/hooks/useConfigTablero";
import { cn } from "@/lib/cn";
import { URGENCIAS, VENCIMIENTOS } from "@/lib/estilos";
import { rangoCorto } from "@/lib/fechas";

type Props = {
  card: CardResumen;
  onAbrir: (card: CardResumen) => void;
  arrastrable?: boolean;
  nueva?: boolean;
};

/** Tarjeta del tablero. Toda la superficie abre la tarjeta con un clic; el
 *  botón "Abrir tarjeta" lo hace explícito (y accesible por teclado). */
export const Tarjeta = memo(function Tarjeta({ card, onAbrir, arrastrable = true, nueva }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `c:${card.id}`,
    data: { tipo: "card", card },
    disabled: !arrastrable,
  });

  const estilo: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={estilo}
      {...attributes}
      {...listeners}
      onClick={() => onAbrir(card)}
      className={cn(
        "touch-manipulation",
        isDragging && "opacity-35 [&>*]:shadow-none",
        arrastrable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      )}
    >
      <CuerpoTarjeta card={card} onAbrir={onAbrir} nueva={nueva} />
    </div>
  );
});

export function CuerpoTarjeta({
  card,
  onAbrir,
  nueva,
  className,
}: {
  card: CardResumen;
  onAbrir?: (card: CardResumen) => void;
  nueva?: boolean;
  className?: string;
}) {
  const urgencia = URGENCIAS[card.urgencia];
  const venc = VENCIMIENTOS[card.vencimiento];
  const terminada = card.vencimiento === "terminada";
  const fechas = rangoCorto(card.fecha_inicio, card.fecha_fin);
  const config = useConfigTablero();
  const etiquetas = card.etiquetas.map((id) => config.etiquetas.get(id)).filter((e) => e !== undefined);
  const campos = config.camposVisibles.filter((c) => card.campos[String(c.id)] !== undefined);
  const espera = terminada ? undefined : config.esperando.get(card.id);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[14px] border border-linea/80 bg-white py-3 pr-3 pl-4",
        "shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] duration-200 ease-suave",
        "hover:-translate-y-0.5 hover:border-morado/25 hover:shadow-[0_12px_24px_-14px_rgba(50,64,123,0.55)]",
        nueva && "animate-pop",
        className,
      )}
    >
      {card.portada !== null && (
        // Portada: la primera imagen adjunta, de borde a borde (anula el relleno
        // de la tarjeta). Sin arrastre nativo: el que manda es el de dnd-kit.
        <div className="-mt-3 mb-2.5 -mr-3 -ml-4 h-32 overflow-hidden bg-columna">
          <img
            src={urlImagen(card.portada, "miniatura")}
            alt=""
            loading="lazy"
            draggable={false}
            className={cn("pointer-events-none size-full object-cover", terminada && "opacity-60")}
          />
        </div>
      )}

      <span
        className={cn("absolute bottom-2.5 left-0 w-[3.5px] rounded-r-full", card.portada !== null ? "top-[8.75rem]" : "top-2.5")}
        style={{ background: urgencia.color, opacity: terminada ? 0.35 : 1 }}
        aria-hidden
      />

      {etiquetas.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {etiquetas.map((e) => (
            <span
              key={e.id}
              className="max-w-full truncate rounded-md px-1.5 py-px text-[0.64rem] font-bold tracking-wide text-white"
              style={{ background: e.color, opacity: terminada ? 0.55 : 1 }}
            >
              {e.nombre}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        {terminada && <CircleCheck className="check-burst mt-0.5 size-4 shrink-0 text-[#059669]" />}
        <p
          className={cn(
            "flex-1 text-[0.9rem] leading-snug font-medium break-words",
            terminada ? "text-tenue line-through decoration-tenue/40" : "text-texto",
          )}
        >
          {card.titulo}
        </p>
        {onAbrir && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAbrir(card);
            }}
            className="-mt-0.5 -mr-0.5 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.7rem] font-semibold text-morado opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-morado/8 focus-visible:opacity-100"
            aria-label={`Abrir tarjeta #${card.numero}`}
          >
            <Maximize2 className="size-3" />
            Abrir
          </button>
        )}
      </div>

      {campos.length > 0 && (
        <dl className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[0.7rem]">
          {campos.map((c) => (
            <div key={c.id} className="flex min-w-0 gap-1">
              <dt className="text-tenue/80">{c.nombre}:</dt>
              <dd className="truncate font-semibold text-texto">{textoValor(c, card.campos[String(c.id)])}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {(card.urgencia === "alta" || card.urgencia === "critica") && !terminada && (
          <span
            className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold tracking-wide uppercase"
            style={{ background: `color-mix(in srgb, ${urgencia.color} 12%, #fff)`, color: urgencia.color }}
          >
            {urgencia.etiqueta}
          </span>
        )}
        {espera && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[0.72rem] font-semibold text-[#c2410c]"
            title="Depende de tarjetas que aún no terminan"
          >
            <Hourglass className="size-3" />
            Espera a {espera.slice(0, 2).map((n) => `#${n}`).join(", ")}
            {espera.length > 2 && ` +${espera.length - 2}`}
          </span>
        )}
        {fechas && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold"
            style={
              venc && card.vencimiento !== "al_dia"
                ? { background: `color-mix(in srgb, ${venc.color} 12%, #fff)`, color: venc.color }
                : { background: "#eceef8", color: "#5a6294" }
            }
            title={venc?.etiqueta}
          >
            <CalendarDays className="size-3" />
            {fechas}
          </span>
        )}
        {card.checklist.total > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.72rem] font-semibold tabular-nums transition-colors duration-300",
              card.checklist.hechos === card.checklist.total ? "bg-[#ecfdf5] text-[#059669]" : "text-tenue",
            )}
            aria-label={`Checklist ${card.checklist.hechos} de ${card.checklist.total}`}
          >
            <ListChecks className="size-3.5" />
            {card.checklist.hechos}/{card.checklist.total}
          </span>
        )}
        {card.tiene_descripcion && <TextAlignStart className="size-3.5 text-tenue/70" aria-label="Tiene descripción" />}
        {card.comentarios > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[0.72rem] font-medium text-tenue">
            <MessageSquare className="size-3.5" />
            {card.comentarios}
          </span>
        )}
        {card.num_adjuntos > 0 && (
          <span
            className="inline-flex items-center gap-0.5 text-[0.72rem] font-medium text-tenue"
            aria-label={card.num_adjuntos === 1 ? "1 adjunto" : `${card.num_adjuntos} adjuntos`}
          >
            <Paperclip className="size-3.5" />
            {card.num_adjuntos}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[0.68rem] font-medium text-tenue/60">#{card.numero}</span>
          <PilaAvatares personas={card.responsables} />
        </span>
      </div>
    </article>
  );
}
