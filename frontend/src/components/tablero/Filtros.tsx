import { Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { Etiqueta, Persona } from "@/api/tipos";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { LISTA_URGENCIAS, URGENCIAS } from "@/lib/estilos";
import { FILTROS_VACIOS, hayFiltros, type EstadoFiltros } from "@/lib/filtros";

function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

export function BarraFiltros({
  filtros,
  onCambio,
  personas,
  etiquetas = [],
  total,
  visibles,
}: {
  filtros: EstadoFiltros;
  onCambio: (f: EstadoFiltros) => void;
  personas: Persona[];
  etiquetas?: Etiqueta[];
  total: number;
  visibles: number;
}) {
  const activos = hayFiltros(filtros);
  // En el teléfono solo se ve el buscador; el resto se despliega con «Filtros».
  const [desplegados, setDesplegados] = useState(false);
  const criterios =
    filtros.urgencias.length + filtros.etiquetas.length + filtros.responsables.length + (filtros.soloVencidas ? 1 : 0);
  return (
    <div className="mb-4 flex animate-rise flex-wrap items-center gap-2 [animation-delay:80ms]">
      <label className="relative flex items-center max-sm:flex-1">
        <Search className="pointer-events-none absolute left-3 size-4 text-tenue/70" />
        <input
          value={filtros.texto}
          onChange={(e) => onCambio({ ...filtros, texto: e.target.value })}
          placeholder="Buscar tarjeta o #número"
          className="h-10 w-full rounded-xl border border-linea bg-white pr-3 pl-9 text-base outline-none transition-all duration-200 placeholder:text-tenue/60 focus:border-morado/50 focus:shadow-[0_0_0_4px_rgba(50,64,123,0.08)] sm:h-9 sm:w-56 sm:text-sm sm:focus:w-64"
        />
      </label>

      <button
        type="button"
        onClick={() => setDesplegados((v) => !v)}
        aria-expanded={desplegados}
        className={cn(
          "flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors sm:hidden",
          desplegados || criterios ? "border-morado/40 bg-morado/[0.06] text-morado" : "border-linea bg-white text-tenue",
        )}
      >
        <SlidersHorizontal className="size-4" />
        Filtros
        {criterios > 0 && (
          <span className="rounded-full bg-morado px-1.5 text-[0.7rem] leading-5 text-white tabular-nums">{criterios}</span>
        )}
      </button>

      {/* `sm:contents`: en pantallas anchas los filtros siguen en la misma fila. */}
      <div className={cn("w-full flex-wrap items-center gap-2 sm:contents", desplegados ? "flex" : "hidden")}>
        <div className="flex items-center gap-1 rounded-xl border border-linea bg-white p-1 max-sm:w-full">
          {LISTA_URGENCIAS.map((u) => {
            const activo = filtros.urgencias.includes(u);
            const { etiqueta, color } = URGENCIAS[u];
            return (
              <button
                key={u}
                type="button"
                onClick={() => onCambio({ ...filtros, urgencias: alternar(filtros.urgencias, u) })}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-200 max-sm:flex-1 max-sm:justify-center max-sm:py-2.5",
                  activo ? "text-white shadow-sm" : "text-tenue hover:bg-columna",
                )}
                style={activo ? { background: color } : undefined}
                aria-pressed={activo}
              >
                {!activo && <span className="size-2 rounded-full" style={{ background: color }} />}
                {etiqueta}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onCambio({ ...filtros, soloVencidas: !filtros.soloVencidas })}
          aria-pressed={filtros.soloVencidas}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all duration-200 max-sm:h-10",
            filtros.soloVencidas
              ? "border-[#fca5a5] bg-[#fef2f2] text-[#dc2626]"
              : "border-linea bg-white text-tenue hover:border-morado/30",
          )}
        >
          <TriangleAlert className="size-3.5" />
          Vencidas o por vencer
        </button>

        {etiquetas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-linea bg-white p-1" aria-label="Filtrar por etiqueta">
            {etiquetas.map((e) => {
              const activa = filtros.etiquetas.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onCambio({ ...filtros, etiquetas: alternar(filtros.etiquetas, e.id) })}
                  aria-pressed={activa}
                  className={cn(
                    "rounded-lg px-2 py-1 text-xs font-semibold transition-all duration-200 max-sm:px-3 max-sm:py-2.5",
                    activa ? "text-white shadow-sm" : "text-tenue hover:bg-columna",
                  )}
                  style={activa ? { background: e.color } : { color: e.color }}
                >
                  {e.nombre}
                </button>
              );
            })}
          </div>
        )}

        {personas.length > 1 && (
          <div className="flex items-center -space-x-1 pl-1">
            {personas.slice(0, 8).map((p) => {
              const activo = filtros.responsables.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onCambio({ ...filtros, responsables: alternar(filtros.responsables, p.id) })}
                  className={cn(
                    "rounded-full transition-all duration-200 hover:z-10 hover:-translate-y-0.5 max-sm:p-1",
                    activo ? "z-10 scale-110 ring-2 ring-morado ring-offset-1" : "opacity-80 hover:opacity-100",
                  )}
                  aria-pressed={activo}
                  aria-label={`Filtrar por ${p.nombre}`}
                >
                  <Avatar persona={p} tamano="sm" />
                </button>
              );
            })}
          </div>
        )}

      </div>

      <AnimatePresence>
        {activos && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            className="flex items-center gap-2 text-xs text-tenue"
          >
            <span>
              {visibles} de {total}
            </span>
            <button
              type="button"
              onClick={() => onCambio(FILTROS_VACIOS)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-morado hover:bg-morado/8 max-sm:py-2.5"
            >
              <X className="size-3.5" />
              Limpiar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
