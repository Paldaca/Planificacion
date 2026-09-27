import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ChartGantt, CircleCheck, CircleDot, Ellipsis, EyeOff, Gauge, GripVertical, Pencil } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { CardResumen, Columna } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { ItemMenu, Menu, SeparadorMenu } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";

import { AltaRapida } from "./AltaRapida";
import { Tarjeta } from "./Tarjeta";

type Props = {
  columna: Columna;
  cards: CardResumen[];
  puedeEditar: boolean;
  puedeGestionar: boolean;
  arrastreTarjetas: boolean;
  nuevas: Set<number>;
  onAbrir: (card: CardResumen) => void;
  onCrear: (columnaId: number, titulo: string) => Promise<unknown>;
  creando: boolean;
  onRenombrar: (columna: Columna, nombre: string) => void;
  onAlternarFinal: (columna: Columna) => void;
  onAlternarGantt: (columna: Columna) => void;
  onLimite: (columna: Columna) => void;
  /** Tarjetas de la columna sin filtros (para el límite). */
  total: number;
  onArchivar: (columna: Columna) => void;
  indice: number;
};

export function ColumnaKanban({
  columna,
  cards,
  puedeEditar,
  puedeGestionar,
  arrastreTarjetas,
  nuevas,
  onAbrir,
  onCrear,
  creando,
  onRenombrar,
  onAlternarFinal,
  onAlternarGantt,
  onLimite,
  total,
  onArchivar,
  indice,
}: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: `k:${columna.id}`, data: { tipo: "columna", columna }, disabled: !puedeGestionar });
  const { setNodeRef: setZonaRef, isOver: zonaActiva } = useDroppable({
    id: `z:${columna.id}`,
    data: { tipo: "zona", columnaId: columna.id },
  });

  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(columna.nombre);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) entrada.current?.select();
  }, [editando]);

  function empezarEdicion() {
    setNombre(columna.nombre);
    setEditando(true);
  }

  function guardarNombre() {
    setEditando(false);
    const limpio = nombre.trim();
    if (limpio && limpio !== columna.nombre) onRenombrar(columna, limpio);
    else setNombre(columna.nombre);
  }

  const estilo: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    animationDelay: `${indice * 60}ms`,
  };

  return (
    <section
      ref={setNodeRef}
      style={estilo}
      className={cn(
        "entrada flex max-h-full w-[min(85vw,300px)] shrink-0 snap-start flex-col rounded-[18px] bg-columna/80",
        "border border-transparent transition-[border-color,background-color] duration-200",
        zonaActiva && "border-morado/25 bg-[#e6e9f7]",
        isDragging && "opacity-40",
      )}
      aria-label={`Columna ${columna.nombre}`}
    >
      <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2">
        {puedeGestionar && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="-ml-1 cursor-grab rounded p-0.5 text-tenue/50 transition-colors hover:text-morado active:cursor-grabbing pointer-coarse:-my-2 pointer-coarse:-ml-2 pointer-coarse:p-2.5"
            aria-label={`Mover columna ${columna.nombre}`}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        {columna.es_final ? (
          <CircleCheck className="size-4 shrink-0 text-[#059669]" aria-label="Columna final" />
        ) : (
          <CircleDot className="size-4 shrink-0 text-morado/60" />
        )}
        {editando ? (
          <input
            ref={entrada}
            value={nombre}
            maxLength={60}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={guardarNombre}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardarNombre();
              if (e.key === "Escape") {
                setNombre(columna.nombre);
                setEditando(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-morado/40 bg-white px-2 py-0.5 font-display text-sm font-semibold text-marino outline-none"
          />
        ) : (
          <h2
            className={cn(
              "min-w-0 flex-1 truncate font-display text-[0.95rem] font-semibold text-marino",
              puedeGestionar && "cursor-text",
            )}
            onDoubleClick={() => puedeGestionar && empezarEdicion()}
          >
            {columna.nombre}
          </h2>
        )}
        {!columna.incluir_en_gantt && (
          <EyeOff className="size-3.5 shrink-0 text-tenue/60" aria-label="Fuera del Gantt">
            <title>Sus tarjetas no aparecen en el Gantt</title>
          </EyeOff>
        )}
        {columna.limite_cards ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.72rem] font-bold tabular-nums transition-colors",
              total > columna.limite_cards
                ? "bg-[#fef2f2] text-[#dc2626]"
                : total === columna.limite_cards
                  ? "bg-[#fffbeb] text-[#b45309]"
                  : "bg-white text-tenue",
            )}
            title={
              total > columna.limite_cards
                ? `Pasó su límite de ${columna.limite_cards} tarjetas`
                : `Límite: ${columna.limite_cards} tarjetas`
            }
          >
            {cards.length !== total ? `${cards.length} · ` : ""}
            {total}/{columna.limite_cards}
          </span>
        ) : (
          <span className="rounded-full bg-white px-2 py-0.5 text-[0.72rem] font-bold text-tenue tabular-nums">
            {cards.length}
          </span>
        )}
        {puedeGestionar && (
          <Menu
            disparador={
              <Boton variante="fantasma" tamano="icono-sm" aria-label={`Opciones de ${columna.nombre}`}>
                <Ellipsis />
              </Boton>
            }
          >
            <ItemMenu icono={Pencil} onSelect={empezarEdicion}>
              Renombrar
            </ItemMenu>
            <ItemMenu icono={CircleCheck} onSelect={() => onAlternarFinal(columna)}>
              {columna.es_final ? "Quitar como columna final" : "Marcar como columna final"}
            </ItemMenu>
            <ItemMenu icono={Gauge} onSelect={() => onLimite(columna)}>
              {columna.limite_cards ? `Límite: ${columna.limite_cards} tarjetas…` : "Límite de tarjetas…"}
            </ItemMenu>
            <ItemMenu icono={columna.incluir_en_gantt ? EyeOff : ChartGantt} onSelect={() => onAlternarGantt(columna)}>
              {columna.incluir_en_gantt ? "Sacar del Gantt" : "Incluir en el Gantt"}
            </ItemMenu>
            <SeparadorMenu />
            <ItemMenu icono={Archive} peligro onSelect={() => onArchivar(columna)}>
              Archivar columna
            </ItemMenu>
          </Menu>
        )}
      </header>

      <div ref={setZonaRef} className="kanban-scroll flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-1">
        <SortableContext items={cards.map((c) => `c:${c.id}`)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Tarjeta
              key={card.id}
              card={card}
              onAbrir={onAbrir}
              arrastrable={arrastreTarjetas}
              nueva={nuevas.has(card.id)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex h-16 items-center justify-center rounded-[14px] border-2 border-dashed border-linea/80 text-xs text-tenue/70">
            {puedeEditar ? "Suelta una tarjeta aquí" : "Sin tarjetas"}
          </div>
        )}
      </div>

      {puedeEditar && (
        <div className="px-2.5 pt-1 pb-2.5">
          <AltaRapida onCrear={(titulo) => onCrear(columna.id, titulo)} creando={creando} />
        </div>
      )}
    </section>
  );
}
