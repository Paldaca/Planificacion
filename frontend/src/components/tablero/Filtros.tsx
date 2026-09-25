import { Search, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { CardResumen, Persona, Urgencia } from "@/api/tipos";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { LISTA_URGENCIAS, URGENCIAS } from "@/lib/estilos";

export type EstadoFiltros = {
  texto: string;
  urgencias: Urgencia[];
  responsables: number[];
  soloVencidas: boolean;
};

export const FILTROS_VACIOS: EstadoFiltros = { texto: "", urgencias: [], responsables: [], soloVencidas: false };

export function hayFiltros(f: EstadoFiltros) {
  return Boolean(f.texto.trim() || f.urgencias.length || f.responsables.length || f.soloVencidas);
}

export function filtrar(cards: CardResumen[], f: EstadoFiltros): CardResumen[] {
  const texto = f.texto.trim().toLowerCase();
  return cards.filter((c) => {
    if (texto && !c.titulo.toLowerCase().includes(texto) && !`#${c.numero}`.includes(texto)) return false;
    if (f.urgencias.length && !f.urgencias.includes(c.urgencia)) return false;
    if (f.responsables.length && !c.responsables.some((p) => f.responsables.includes(p.id))) return false;
    if (f.soloVencidas && c.vencimiento !== "vencida" && c.vencimiento !== "vence_pronto") return false;
    return true;
  });
}

function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

export function BarraFiltros({
  filtros,
  onCambio,
  personas,
  total,
  visibles,
}: {
  filtros: EstadoFiltros;
  onCambio: (f: EstadoFiltros) => void;
  personas: Persona[];
  total: number;
  visibles: number;
}) {
  const activos = hayFiltros(filtros);
  return (
    <div className="mb-4 flex animate-rise flex-wrap items-center gap-2 [animation-delay:80ms]">
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-tenue/70" />
        <input
          value={filtros.texto}
          onChange={(e) => onCambio({ ...filtros, texto: e.target.value })}
          placeholder="Buscar tarjeta o #número"
          className="h-9 w-56 rounded-xl border border-linea bg-white pr-3 pl-9 text-sm outline-none transition-all duration-200 placeholder:text-tenue/60 focus:w-64 focus:border-morado/50 focus:shadow-[0_0_0_4px_rgba(50,64,123,0.08)]"
        />
      </label>

      <div className="flex items-center gap-1 rounded-xl border border-linea bg-white p-1">
        {LISTA_URGENCIAS.map((u) => {
          const activo = filtros.urgencias.includes(u);
          const { etiqueta, color } = URGENCIAS[u];
          return (
            <button
              key={u}
              type="button"
              onClick={() => onCambio({ ...filtros, urgencias: alternar(filtros.urgencias, u) })}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-200",
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
          "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all duration-200",
          filtros.soloVencidas
            ? "border-[#fca5a5] bg-[#fef2f2] text-[#dc2626]"
            : "border-linea bg-white text-tenue hover:border-morado/30",
        )}
      >
        <TriangleAlert className="size-3.5" />
        Vencidas o por vencer
      </button>

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
                  "rounded-full transition-all duration-200 hover:z-10 hover:-translate-y-0.5",
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
              className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-morado hover:bg-morado/8"
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
