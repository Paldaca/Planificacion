import { CircleCheck, Plus } from "lucide-react";
import { useMemo } from "react";

import type { CardResumen, Feriado } from "@/api/tipos";
import { rangoDe } from "@/lib/calendarioMes";
import { cn } from "@/lib/cn";
import { DIAS_SEMANA, aISO, esFinDeSemana, mismoDia } from "@/lib/dias";
import { URGENCIAS } from "@/lib/estilos";
import { parsearDia, rangoCorto } from "@/lib/fechas";

/**
 * Calendario en el teléfono: la rejilla con barras necesita ~720 px. Aquí el
 * mes cabe a lo ancho (cada día con puntos de color, uno por tarjeta, hasta
 * tres) y debajo se listan las tarjetas del día elegido, con «Nueva tarea
 * este día». Sin arrastre: las fechas se cambian desde la tarjeta.
 */
export function CalendarioMovil({
  dias,
  mes,
  hoy,
  feriados,
  cards,
  seleccionado,
  onSeleccionar,
  onAbrir,
  onCrear,
}: {
  dias: Date[];
  mes: Date;
  hoy: Date;
  feriados: Map<string, Feriado>;
  cards: CardResumen[];
  seleccionado: string;
  onSeleccionar: (iso: string) => void;
  onAbrir: (card: CardResumen) => void;
  /** Sin él (solo lectura) no se ofrece crear. */
  onCrear?: (iso: string) => void;
}) {
  const porDia = useMemo(() => {
    const isos = dias.map(aISO);
    const mapa = new Map<string, CardResumen[]>();
    for (const card of cards) {
      const rango = rangoDe(card);
      if (!rango) continue;
      for (const iso of isos) {
        if (iso < rango[0] || iso > rango[1]) continue;
        const lista = mapa.get(iso);
        if (lista) lista.push(card);
        else mapa.set(iso, [card]);
      }
    }
    return mapa;
  }, [dias, cards]);

  const delDia = porDia.get(seleccionado) ?? [];
  const feriado = feriados.get(seleccionado);
  const fechaLarga = parsearDia(seleccionado).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="sm:hidden">
      <div className="grid grid-cols-7 border-b border-linea bg-fondo/70">
        {DIAS_SEMANA.map((d, i) => (
          <div key={d} className={cn("py-2 text-center text-[0.7rem] font-bold uppercase", i >= 5 ? "text-tenue/60" : "text-tenue")}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia) => {
          const iso = aISO(dia);
          const delDiaCelda = porDia.get(iso) ?? [];
          const elegido = iso === seleccionado;
          const esHoy = mismoDia(dia, hoy);
          const fuera = dia.getMonth() !== mes.getMonth();
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSeleccionar(iso)}
              aria-pressed={elegido}
              aria-label={`${dia.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" })}: ${
                delDiaCelda.length === 1 ? "1 tarjeta" : `${delDiaCelda.length} tarjetas`
              }`}
              className={cn(
                "flex h-13 flex-col items-center justify-center gap-1 border-r border-b border-linea/50 transition-colors [&:nth-child(7n)]:border-r-0",
                esFinDeSemana(dia) && "bg-fondo/80",
                feriados.has(iso) && "bg-rojo/[0.06]",
                elegido && "bg-morado/[0.08]",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  esHoy ? "bg-morado text-white" : fuera ? "text-tenue/40" : "text-texto",
                  elegido && !esHoy && "ring-2 ring-morado/60",
                )}
              >
                {dia.getDate()}
              </span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {delDiaCelda.slice(0, 3).map((c) => (
                  <span key={c.id} className="size-1.5 rounded-full" style={{ background: URGENCIAS[c.urgencia].color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs font-semibold text-tenue first-letter:uppercase">
            {fechaLarga}
            {feriado && <span className="text-rojo"> · {feriado.nombre}</span>}
          </p>
          {onCrear && (
            <button
              type="button"
              onClick={() => onCrear(seleccionado)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-morado/8 px-3 text-sm font-semibold text-morado active:bg-morado/14"
            >
              <Plus className="size-4" />
              Nueva tarea este día
            </button>
          )}
        </div>
        {delDia.length ? (
          <ul className="space-y-1.5">
            {delDia.map((c) => {
              const terminada = c.vencimiento === "terminada";
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onAbrir(c)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-linea bg-white px-3 py-2.5 text-left transition-colors active:bg-morado/[0.05]"
                  >
                    <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: URGENCIAS[c.urgencia].color }} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-medium text-texto", terminada && "text-tenue line-through")}>
                        {c.titulo}
                      </span>
                      <span className="block text-xs text-tenue tabular-nums">
                        #{c.numero} · {rangoCorto(c.fecha_inicio, c.fecha_fin)}
                      </span>
                    </span>
                    {terminada && <CircleCheck className="size-4 shrink-0 text-[#059669]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl bg-fondo px-3 py-4 text-center text-sm text-tenue">Sin tarjetas este día.</p>
        )}
      </div>
    </div>
  );
}
