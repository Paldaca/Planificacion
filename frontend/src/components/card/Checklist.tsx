import { Check, ListChecks, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";

import { useBorrarItem, useCrearItem, useEditarItem } from "@/api/queries";
import type { CardDetalle, ItemChecklist } from "@/api/tipos";
import { cn } from "@/lib/cn";

export function Checklist({ card, tableroId, puede }: { card: CardDetalle; tableroId: number; puede: boolean }) {
  const ref = { id: card.id, numero: card.numero };
  const crear = useCrearItem(tableroId, ref);
  const editar = useEditarItem(tableroId, ref);
  const borrar = useBorrarItem(tableroId, ref);
  const [nuevo, setNuevo] = useState("");
  const entrada = useRef<HTMLInputElement>(null);

  const total = card.items.length;
  const hechos = card.items.filter((i) => i.hecho).length;
  const avance = total ? Math.round((hechos / total) * 100) : 0;
  const completo = total > 0 && hechos === total;

  async function agregar() {
    const texto = nuevo.trim();
    if (!texto) return;
    setNuevo("");
    await crear.mutateAsync(texto);
    entrada.current?.focus();
  }

  if (!total && !puede) return null;

  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-2 font-display text-[0.95rem] font-semibold text-marino">
        <ListChecks className="size-4 text-morado" />
        Checklist
        {total > 0 && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.7rem] tabular-nums transition-colors duration-300",
              completo ? "bg-[#ecfdf5] text-[#059669]" : "bg-columna text-tenue",
            )}
          >
            {hechos}/{total}
          </span>
        )}
      </h3>

      {total > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-columna">
          <motion.div
            className="h-full rounded-full"
            initial={false}
            animate={{ width: `${avance}%`, backgroundColor: completo ? "#059669" : "#32407b" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      )}

      <ul className="space-y-0.5">
        <AnimatePresence initial={false}>
          {card.items.map((item) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 24, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <Fila
                item={item}
                puede={puede}
                onAlternar={() => editar.mutate({ id: item.id, cambios: { hecho: !item.hecho } })}
                onRenombrar={(texto) => editar.mutate({ id: item.id, cambios: { texto } })}
                onBorrar={() => borrar.mutate(item.id)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {puede && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-linea px-2.5 py-1.5 transition-colors focus-within:border-morado/50 focus-within:bg-white">
          <Plus className="size-4 text-tenue" />
          <input
            ref={entrada}
            value={nuevo}
            maxLength={300}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void agregar();
              if (e.key === "Escape") setNuevo("");
            }}
            placeholder="Añadir un elemento (Enter)"
            className="h-8 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-tenue/60"
          />
        </div>
      )}
    </section>
  );
}

function Fila({
  item,
  puede,
  onAlternar,
  onRenombrar,
  onBorrar,
}: {
  item: ItemChecklist;
  puede: boolean;
  onAlternar: () => void;
  onRenombrar: (texto: string) => void;
  onBorrar: () => void;
}) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-fondo">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.hecho}
        aria-label={item.hecho ? `Reabrir «${item.texto}»` : `Completar «${item.texto}»`}
        disabled={!puede}
        onClick={onAlternar}
        className={cn(
          "relative flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 active:scale-90 pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5",
          item.hecho ? "border-[#059669] bg-[#059669] text-white" : "border-linea bg-white hover:border-morado/50",
        )}
      >
        {item.hecho && <Check className="check-burst size-3.5" strokeWidth={3} />}
      </button>

      {editando ? (
        <input
          autoFocus
          defaultValue={item.texto}
          maxLength={300}
          onBlur={(e) => {
            setEditando(false);
            const texto = e.target.value.trim();
            if (texto && texto !== item.texto) onRenombrar(texto);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditando(false);
          }}
          className="flex-1 rounded-md border border-morado/40 bg-white px-2 py-0.5 text-sm outline-none"
        />
      ) : (
        <span
          onClick={() => puede && setEditando(true)}
          className={cn(
            "flex-1 text-sm transition-colors duration-300",
            item.hecho ? "text-tenue line-through decoration-tenue/40" : "text-texto",
            puede && "cursor-text",
          )}
          title={item.hecho && item.hecho_por ? `Completado por ${item.hecho_por.nombre}` : undefined}
        >
          {item.texto}
        </span>
      )}

      {puede && !editando && (
        <button
          type="button"
          onClick={onBorrar}
          className="rounded-md p-1 text-tenue opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#dc2626] focus-visible:opacity-100 pointer-coarse:p-2 pointer-coarse:opacity-100"
          aria-label={`Eliminar «${item.texto}»`}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
