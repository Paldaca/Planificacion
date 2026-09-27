import { ArrowDown, ArrowUp, ChartGantt, CircleCheck, ListChecks, MessageSquare } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import type { CampoPersonalizado, CardResumen, Columna, Etiqueta, TableroDetalle } from "@/api/tipos";
import { PilaAvatares } from "@/components/ui/Avatar";
import { Pildora } from "@/components/ui/Estados";
import { textoValor, useConfigTablero } from "@/hooks/useConfigTablero";
import { cn } from "@/lib/cn";
import { URGENCIAS, VENCIMIENTOS } from "@/lib/estilos";
import { diaCorto } from "@/lib/fechas";

/** `campo:<id>`: columna de un campo personalizado (fase 5). */
type Clave =
  | "numero"
  | "titulo"
  | "columna"
  | "responsables"
  | "urgencia"
  | "fecha_inicio"
  | "fecha_fin"
  | "avance"
  | `campo:${number}`;

type Orden = { clave: Clave; asc: boolean };

const COLUMNAS: { clave: Clave; etiqueta: string; className?: string }[] = [
  { clave: "numero", etiqueta: "#", className: "hidden w-14 sm:table-cell" },
  { clave: "titulo", etiqueta: "Tarjeta" },
  { clave: "columna", etiqueta: "Estado", className: "w-24 sm:w-36" },
  { clave: "responsables", etiqueta: "Responsables", className: "hidden w-32 md:table-cell" },
  { clave: "urgencia", etiqueta: "Urgencia", className: "hidden w-28 sm:table-cell" },
  { clave: "fecha_inicio", etiqueta: "Inicio", className: "hidden w-24 lg:table-cell" },
  { clave: "fecha_fin", etiqueta: "Fin", className: "w-20 sm:w-32" },
  { clave: "avance", etiqueta: "Avance", className: "hidden w-24 lg:table-cell" },
];

/** Las fechas vacías (y los campos sin valor) van siempre al final, se ordene como se ordene. */
function comparar(a: CardResumen, b: CardResumen, orden: Orden, columnas: Map<number, Columna>): number {
  const signo = orden.asc ? 1 : -1;
  const vacioAlFinal = (x: string | null, y: string | null) => {
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return signo * x.localeCompare(y);
  };
  switch (orden.clave) {
    case "numero":
      return signo * (a.numero - b.numero);
    case "titulo":
      return signo * a.titulo.localeCompare(b.titulo, "es", { numeric: true });
    case "columna":
      return signo * ((columnas.get(a.columna)?.orden ?? 0) - (columnas.get(b.columna)?.orden ?? 0) || a.orden - b.orden);
    case "responsables":
      return signo * (a.responsables[0]?.nombre ?? "~").localeCompare(b.responsables[0]?.nombre ?? "~", "es");
    case "urgencia":
      return signo * (URGENCIAS[a.urgencia].orden - URGENCIAS[b.urgencia].orden);
    case "fecha_inicio":
      return vacioAlFinal(a.fecha_inicio, b.fecha_inicio);
    case "fecha_fin":
      return vacioAlFinal(a.fecha_fin, b.fecha_fin);
    case "avance": {
      const pa = a.checklist.total ? a.checklist.hechos / a.checklist.total : -1;
      const pb = b.checklist.total ? b.checklist.hechos / b.checklist.total : -1;
      return signo * (pa - pb);
    }
    default: {
      const id = orden.clave.slice("campo:".length);
      const x = a.campos[id];
      const y = b.campos[id];
      if (x === y) return 0;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return signo * (x - y);
      return signo * String(x).localeCompare(String(y), "es", { numeric: true });
    }
  }
}

export function VistaLista({
  tablero,
  visibles,
  onAbrir,
}: {
  tablero: TableroDetalle;
  visibles: CardResumen[];
  onAbrir: (card: CardResumen) => void;
}) {
  const [orden, setOrden] = useState<Orden>({ clave: "fecha_fin", asc: true });
  const { etiquetas, campos } = useConfigTablero();
  const columnas = useMemo(() => new Map(tablero.columnas.map((c) => [c.id, c])), [tablero.columnas]);
  // Una columna por campo personalizado activo; en pantallas anchas (no caben en el celular).
  const encabezados = useMemo(
    () => [
      ...COLUMNAS,
      ...campos.map((c) => ({ clave: `campo:${c.id}` as Clave, etiqueta: c.nombre, className: "hidden w-32 xl:table-cell" })),
    ],
    [campos],
  );
  const filas = useMemo(
    () => [...visibles].sort((a, b) => comparar(a, b, orden, columnas) || a.id - b.id),
    [visibles, orden, columnas],
  );

  function ordenarPor(clave: Clave) {
    setOrden((o) => (o.clave === clave ? { clave, asc: !o.asc } : { clave, asc: true }));
  }

  if (!visibles.length) {
    return (
      <div className="animate-rise rounded-2xl border border-dashed border-linea bg-white/60 px-6 py-14 text-center text-sm text-tenue">
        {tablero.cards.length ? "Ninguna tarjeta coincide con los filtros." : "Este tablero aún no tiene tarjetas."}
      </div>
    );
  }

  return (
    <div className="animate-rise overflow-hidden rounded-2xl border border-linea bg-white shadow-[0_18px_40px_-32px_rgba(20,22,68,0.45)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm sm:min-w-[640px]">
          <thead>
            <tr className="border-b border-linea bg-fondo/70 text-left">
              {encabezados.map(({ clave, etiqueta, className }) => {
                const activa = orden.clave === clave;
                const Flecha = orden.asc ? ArrowUp : ArrowDown;
                return (
                  <th key={clave} className={cn("px-3 py-2.5 font-semibold", className)} aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => ordenarPor(clave)}
                      className={cn(
                        "inline-flex items-center gap-1 text-[0.7rem] tracking-[0.08em] uppercase transition-colors pointer-coarse:-my-2.5 pointer-coarse:py-2.5",
                        activa ? "text-morado" : "text-tenue hover:text-morado",
                      )}
                    >
                      <span className="max-w-28 truncate">{etiqueta}</span>
                      <Flecha className={cn("size-3 transition-opacity", activa ? "opacity-100" : "opacity-0")} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {filas.map((card) => (
                <Fila
                  key={card.id}
                  card={card}
                  columna={columnas.get(card.columna)}
                  etiquetas={etiquetas}
                  campos={campos}
                  onAbrir={onAbrir}
                />
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      <p className="border-t border-linea/70 px-4 py-2 text-xs text-tenue">
        {filas.length} tarjeta{filas.length === 1 ? "" : "s"} · clic en una fila para abrirla
      </p>
    </div>
  );
}

function Fila({
  card,
  columna,
  etiquetas,
  campos,
  onAbrir,
}: {
  card: CardResumen;
  columna?: Columna;
  etiquetas: Map<number, Etiqueta>;
  campos: CampoPersonalizado[];
  onAbrir: (c: CardResumen) => void;
}) {
  const urgencia = URGENCIAS[card.urgencia];
  const venc = VENCIMIENTOS[card.vencimiento];
  const terminada = card.vencimiento === "terminada";
  return (
    <motion.tr
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      tabIndex={0}
      onClick={() => onAbrir(card)}
      onKeyDown={(e) => e.key === "Enter" && onAbrir(card)}
      className="group cursor-pointer border-b border-linea/60 transition-colors last:border-0 hover:bg-morado/[0.035] focus-visible:bg-morado/[0.05] focus-visible:outline-none"
    >
      <td className="hidden px-3 py-2.5 text-xs font-semibold text-tenue/70 tabular-nums sm:table-cell">#{card.numero}</td>
      <td className="px-3 py-2.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: urgencia.color }} />
          {terminada && <CircleCheck className="size-4 shrink-0 text-[#059669]" />}
          <span className={cn("font-medium text-texto group-hover:text-morado", terminada && "text-tenue line-through decoration-tenue/40")}>
            {card.titulo}
          </span>
          {card.en_gantt_efectivo && card.fecha_inicio && card.fecha_fin && (
            <ChartGantt className="size-3.5 shrink-0 text-tenue/50" aria-label="Entra en el Gantt" />
          )}
          {card.etiquetas.map((id) => {
            const e = etiquetas.get(id);
            return (
              e && (
                <span
                  key={id}
                  className="shrink-0 rounded-md px-1.5 py-px text-[0.66rem] font-semibold text-white"
                  style={{ background: e.color }}
                >
                  {e.nombre}
                </span>
              )
            );
          })}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <Pildora color={columna?.es_final ? "#059669" : undefined}>{columna?.nombre ?? "—"}</Pildora>
      </td>
      <td className="hidden px-3 py-2.5 md:table-cell">
        {card.responsables.length ? <PilaAvatares personas={card.responsables} max={4} /> : <span className="text-xs text-tenue/60">—</span>}
      </td>
      <td className="hidden px-3 py-2.5 sm:table-cell">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: urgencia.color }}>
          <span className="size-2 rounded-full" style={{ background: urgencia.color }} />
          {urgencia.etiqueta}
        </span>
      </td>
      <td className="hidden px-3 py-2.5 text-xs text-tenue tabular-nums lg:table-cell">{diaCorto(card.fecha_inicio) || "—"}</td>
      <td className="px-3 py-2.5">
        {card.fecha_fin ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.72rem] font-semibold tabular-nums"
            style={
              venc && card.vencimiento !== "al_dia"
                ? { background: `color-mix(in srgb, ${venc.color} 12%, #fff)`, color: venc.color }
                : { color: "#5a6294" }
            }
            title={venc?.etiqueta}
          >
            {diaCorto(card.fecha_fin)}
          </span>
        ) : (
          <span className="text-xs text-tenue/60">Sin fecha</span>
        )}
      </td>
      <td className="hidden px-3 py-2.5 lg:table-cell">
        <span className="flex items-center gap-2.5 text-[0.72rem] font-medium text-tenue">
          {card.checklist.total > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <ListChecks className="size-3.5" />
              {card.checklist.hechos}/{card.checklist.total}
            </span>
          )}
          {card.comentarios > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="size-3.5" />
              {card.comentarios}
            </span>
          )}
        </span>
      </td>
      {campos.map((c) => {
        const texto = textoValor(c, card.campos[String(c.id)]);
        return (
          <td
            key={c.id}
            className={cn("hidden max-w-40 truncate px-3 py-2.5 text-xs text-texto xl:table-cell", c.tipo === "numero" && "tabular-nums")}
            title={texto || undefined}
          >
            {texto || <span className="text-tenue/60">—</span>}
          </td>
        );
      })}
    </motion.tr>
  );
}
