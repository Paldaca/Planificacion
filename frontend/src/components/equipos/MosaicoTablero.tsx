import { ArrowRight, LayoutGrid, SquareKanban } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import type { TableroResumen } from "@/api/tipos";
import { cn } from "@/lib/cn";

/**
 * Mosaico de tablero con la anatomía de `.pd-home-card` del Portal: filete
 * superior que se revela al pasar el cursor, icono que se rellena con el
 * acento y flecha que avanza. El acento es el color del equipo.
 */
export function MosaicoTablero({ tablero, indice = 0, destacado }: { tablero: TableroResumen; indice?: number; destacado?: boolean }) {
  const acento = tablero.equipo?.color ?? "#32407b";
  const { abiertas, vencidas, terminadas } = tablero.conteos;
  const total = abiertas + terminadas;
  const avance = total ? Math.round((terminadas / total) * 100) : 0;
  const Icono = tablero.tipo === "personal" ? SquareKanban : LayoutGrid;

  return (
    <Link
      to={`/tableros/${tablero.id}`}
      style={{ "--acento": acento, animationDelay: `${indice * 70}ms` } as CSSProperties}
      className={cn(
        "group relative flex animate-rise flex-col gap-4 overflow-hidden rounded-[22px] border border-linea bg-white p-6",
        "transition-[transform,box-shadow,border-color] duration-200 ease-suave",
        "hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--acento)_28%,#d8dcf0)] hover:shadow-[0_14px_30px_-14px_color-mix(in_srgb,var(--acento)_45%,transparent)]",
        "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--acento)]",
        "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:origin-left before:scale-x-0 before:bg-[var(--acento)] before:transition-transform before:duration-300 before:ease-suave hover:before:scale-x-100",
        destacado && "sm:p-7",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--acento)_10%,#fff)] text-[var(--acento)] transition-all duration-200 group-hover:scale-105 group-hover:-rotate-3 group-hover:bg-[var(--acento)] group-hover:text-white">
          <Icono className="size-6" />
        </span>
        {vencidas > 0 && (
          <span className="rounded-full bg-[#fef2f2] px-2.5 py-1 text-[0.72rem] font-bold text-[#dc2626]">
            {vencidas} {vencidas === 1 ? "vencida" : "vencidas"}
          </span>
        )}
      </div>

      <div>
        <h3 className="font-display text-[1.15rem] font-semibold text-marino">{tablero.nombre}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.6em] text-sm leading-relaxed text-tenue">
          {tablero.descripcion || (tablero.tipo === "personal" ? "Tus tareas privadas: solo tú las ves." : "Sin descripción.")}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium text-tenue">
          <span>
            {abiertas} {abiertas === 1 ? "abierta" : "abiertas"} · {terminadas} {terminadas === 1 ? "terminada" : "terminadas"}
          </span>
          <span className="tabular-nums">{avance}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-columna">
          <div
            className="h-full rounded-full bg-[var(--acento)] transition-[width] duration-700 ease-suave"
            style={{ width: `${avance}%` }}
          />
        </div>
      </div>

      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--acento)]">
        Abrir tablero
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
