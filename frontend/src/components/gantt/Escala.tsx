/** Escala de fechas (arriba) y fondo del Gantt (fines de semana, feriados, filas). */

import { memo } from "react";

import { cn } from "@/lib/cn";
import { MESES_LARGOS, aISO, diferencia, esFinDeSemana, inicioMes, sumarDias } from "@/lib/dias";
import { ALTO_FILA, ALTO_GRUPO, type Fila, type Rango, type Zoom } from "@/lib/gantt";

import { ALTO_ESCALA } from "./tipos";

export const Escala = memo(function Escala({
  rango,
  px,
  zoom,
  feriados,
  xHoy,
}: {
  rango: Rango;
  px: number;
  zoom: Zoom;
  feriados: Map<string, string>;
  xHoy: number;
}) {
  const meses: { x: number; ancho: number; etiqueta: string }[] = [];
  let m = inicioMes(rango.desde);
  while (m <= rango.hasta) {
    const siguiente = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const x = Math.max(0, diferencia(rango.desde, m)) * px;
    const x2 = Math.min(rango.dias, diferencia(rango.desde, siguiente)) * px;
    meses.push({ x, ancho: x2 - x, etiqueta: `${MESES_LARGOS[m.getMonth()]} ${m.getFullYear()}` });
    m = siguiente;
  }
  const dias = Array.from({ length: rango.dias }, (_, i) => sumarDias(rango.desde, i));

  return (
    <div className="sticky top-0 z-20 border-b border-linea bg-fondo" style={{ height: ALTO_ESCALA }}>
      <div className="relative h-6 border-b border-linea/60">
        {meses.map((mes) => (
          <div
            key={mes.etiqueta}
            className="absolute top-0 flex h-full items-center overflow-clip border-l border-linea/80 px-2 text-[0.7rem] font-bold text-marino capitalize"
            style={{ left: mes.x, width: mes.ancho }}
          >
            <span className="sticky left-[136px] truncate sm:left-[248px] 2xl:left-[296px]">{mes.etiqueta}</span>
          </div>
        ))}
      </div>
      <div className="relative" style={{ height: ALTO_ESCALA - 24 }}>
        {zoom === "dia" &&
          dias.map((d, i) => {
            const iso = aISO(d);
            const feriado = feriados.get(iso);
            return (
              <div
                key={iso}
                title={feriado}
                className={cn(
                  "absolute top-0 flex h-full flex-col items-center justify-center text-[0.62rem] leading-tight tabular-nums",
                  feriado ? "text-rojo" : esFinDeSemana(d) ? "text-tenue/50" : "text-tenue",
                )}
                style={{ left: i * px, width: px }}
              >
                <span className="font-semibold">{d.getDate()}</span>
                <span className="uppercase">{"dlmmjvs"[d.getDay()]}</span>
              </div>
            );
          })}
        {zoom === "semana" &&
          dias.map((d, i) =>
            d.getDay() === 1 ? (
              <div
                key={aISO(d)}
                className="absolute top-0 flex h-full items-center border-l border-linea/70 pl-1 text-[0.62rem] font-semibold text-tenue tabular-nums"
                style={{ left: i * px, width: px * 7 }}
              >
                {d.getDate()}
              </div>
            ) : null,
          )}
        {zoom === "mes" &&
          dias.map((d, i) =>
            d.getDay() === 1 ? (
              <div key={aISO(d)} className="absolute bottom-0 h-2 border-l border-linea" style={{ left: i * px }} />
            ) : null,
          )}
        <span
          className="absolute top-0.5 z-10 -translate-x-1/2 rounded-full bg-rojo px-1.5 py-px text-[0.58rem] font-bold text-white shadow-sm"
          style={{ left: xHoy }}
        >
          HOY
        </span>
      </div>
    </div>
  );
});

export const Fondo = memo(function Fondo({
  rango,
  px,
  feriados,
  filas,
  alto,
}: {
  rango: Rango;
  px: number;
  feriados: Map<string, string>;
  filas: Fila[];
  alto: number;
}) {
  const franjas: { x: number; feriado: boolean }[] = [];
  for (let i = 0; i < rango.dias; i += 1) {
    const d = sumarDias(rango.desde, i);
    const feriado = feriados.has(aISO(d));
    if (feriado || esFinDeSemana(d)) franjas.push({ x: i * px, feriado });
  }
  return (
    <div className="pointer-events-none absolute inset-0" style={{ height: alto }}>
      {franjas.map((f) => (
        <div
          key={f.x}
          className={cn("absolute inset-y-0", f.feriado ? "bg-rojo/[0.07]" : "bg-fondo")}
          style={{ left: f.x, width: px }}
        />
      ))}
      {filas.map((f) =>
        f.tipo === "grupo" ? (
          <div key={`g-${f.clave}`} className="absolute inset-x-0 border-b border-linea/70 bg-fondo/60" style={{ top: f.y, height: ALTO_GRUPO }} />
        ) : (
          <div key={f.card.id} className="absolute inset-x-0 border-b border-linea/40" style={{ top: f.y, height: ALTO_FILA }} />
        ),
      )}
    </div>
  );
});
