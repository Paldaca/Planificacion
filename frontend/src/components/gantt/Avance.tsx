/** Avance del equipo: resumen del Gantt visible y barra resumen de cada grupo. */

import { VENCIMIENTOS } from "@/lib/estilos";
import { rangoCorto } from "@/lib/fechas";
import { ALTO_GRUPO, xDeFecha, type Avance, type Fila, type Rango } from "@/lib/gantt";

/** Una línea: cuánto va terminado del Gantt visible y qué está atrasado. */
export function ResumenAvance({
  avance,
  porVencer,
  sinFechas,
  onVerAtrasadas,
}: {
  avance: Avance;
  porVencer: number;
  sinFechas: number;
  onVerAtrasadas?: () => void;
}) {
  const pct = avance.total ? Math.round((avance.hechas / avance.total) * 100) : 0;
  const atrasos = [
    avance.vencidas > 0 && { n: avance.vencidas, texto: avance.vencidas === 1 ? "vencida" : "vencidas", color: VENCIMIENTOS.vencida!.color },
    porVencer > 0 && { n: porVencer, texto: porVencer === 1 ? "vence pronto" : "vencen pronto", color: VENCIMIENTOS.vence_pronto!.color },
  ].filter((a): a is { n: number; texto: string; color: string } => Boolean(a));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-linea/70 bg-fondo/40 px-3 py-2 text-xs">
      <div className="flex min-w-48 flex-1 items-center gap-2.5">
        <span className="font-semibold text-marino tabular-nums">{pct}% terminado</span>
        <span className="h-1.5 max-w-56 flex-1 overflow-hidden rounded-full bg-linea/70">
          <span className="block h-full rounded-full bg-[#059669] transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </span>
        <span className="text-tenue tabular-nums">
          {avance.hechas} de {avance.total}
        </span>
      </div>
      {atrasos.map((a) =>
        onVerAtrasadas ? (
          <button
            key={a.texto}
            type="button"
            onClick={onVerAtrasadas}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold hover:bg-white pointer-coarse:py-2"
            style={{ color: a.color }}
            title="Ver solo lo vencido o por vencer"
          >
            <span className="size-2 rounded-full" style={{ background: a.color }} />
            {a.n} {a.texto}
          </button>
        ) : (
          <span key={a.texto} className="inline-flex items-center gap-1.5 font-semibold" style={{ color: a.color }}>
            <span className="size-2 rounded-full" style={{ background: a.color }} />
            {a.n} {a.texto}
          </span>
        ),
      )}
      {sinFechas > 0 && <span className="text-tenue">{sinFechas} sin fechas</span>}
    </div>
  );
}

/** Barra resumen del grupo (como una tarea resumen de Project): su tramo y cuánto va hecho. */
export function ResumenGrupo({ fila, rango, px }: { fila: Extract<Fila, { tipo: "grupo" }>; rango: Rango; px: number }) {
  const x1 = xDeFecha(fila.desde!, rango, px);
  const x2 = xDeFecha(fila.hasta!, rango, px) + px;
  const pct = fila.total ? (fila.hechas / fila.total) * 100 : 0;
  return (
    <div
      className="absolute z-[4] h-1.5 overflow-hidden rounded-full"
      style={{
        left: x1,
        width: Math.max(x2 - x1, 6),
        top: fila.y + ALTO_GRUPO / 2 - 3,
        background: `color-mix(in srgb, ${fila.color} 22%, #fff)`,
      }}
      title={`${fila.titulo}: ${fila.hechas} de ${fila.total} terminadas${fila.vencidas ? ` · ${fila.vencidas} ${fila.vencidas === 1 ? "vencida" : "vencidas"}` : ""} · ${rangoCorto(fila.desde, fila.hasta)}`}
    >
      <div className="h-full" style={{ width: `${pct}%`, background: fila.color }} />
    </div>
  );
}
