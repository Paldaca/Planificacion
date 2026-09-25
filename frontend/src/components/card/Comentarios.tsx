import { Ellipsis, MessageSquare, Pencil, Send, Trash } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { useBorrarComentario, useComentarios, useCrearComentario, useEditarComentario } from "@/api/queries";
import type { Comentario, Persona } from "@/api/tipos";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto } from "@/components/ui/Estados";
import { ItemMenu, Menu } from "@/components/ui/Menu";
import { haceCuanto } from "@/lib/fechas";

export function Comentarios({
  tableroId,
  cardId,
  yo,
  puedeComentar,
}: {
  tableroId: number;
  cardId: number;
  yo: Persona;
  puedeComentar: boolean;
}) {
  const { data: comentarios, isLoading } = useComentarios(cardId);
  const crear = useCrearComentario(tableroId, cardId);
  const [texto, setTexto] = useState("");

  async function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    await crear.mutateAsync(limpio);
    setTexto("");
  }

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 font-display text-[0.95rem] font-semibold text-marino">
        <MessageSquare className="size-4 text-morado" />
        Comentarios
        {comentarios && comentarios.length > 0 && (
          <span className="rounded-full bg-columna px-2 py-0.5 text-[0.7rem] text-tenue">
            {comentarios.filter((c) => !c.eliminado).length}
          </span>
        )}
      </h3>

      {puedeComentar && (
        <div className="mb-5 flex gap-3">
          <Avatar persona={yo} tamano="md" conTooltip={false} />
          <div className="flex-1 rounded-2xl border border-linea bg-white transition-shadow focus-within:border-morado/50 focus-within:shadow-[0_0_0_4px_rgba(50,64,123,0.08)]">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void enviar();
              }}
              rows={2}
              maxLength={5000}
              placeholder="Escribe un comentario para ti o tu equipo…"
              className="block w-full resize-none rounded-2xl bg-transparent px-3.5 pt-3 text-sm text-texto outline-none placeholder:text-tenue/60"
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <span className="text-[0.7rem] text-tenue/70">Ctrl + Enter para enviar</span>
              <Boton tamano="sm" onClick={() => void enviar()} cargando={crear.isPending} disabled={!texto.trim()}>
                <Send />
                Comentar
              </Boton>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Esqueleto className="h-16" />
          <Esqueleto className="h-12" />
        </div>
      ) : comentarios && comentarios.length > 0 ? (
        <ol className="space-y-4">
          <AnimatePresence initial={false}>
            {[...comentarios].reverse().map((c) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <ItemComentario comentario={c} tableroId={tableroId} cardId={cardId} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="rounded-xl bg-fondo px-4 py-5 text-center text-sm text-tenue">
          Todavía no hay comentarios.
        </p>
      )}
    </section>
  );
}

function ItemComentario({ comentario, tableroId, cardId }: { comentario: Comentario; tableroId: number; cardId: number }) {
  const editar = useEditarComentario(cardId);
  const borrar = useBorrarComentario(tableroId, cardId);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(comentario.texto);
  const autor = comentario.autor;

  if (comentario.eliminado) {
    return <p className="pl-12 text-xs text-tenue/70 italic">Comentario eliminado</p>;
  }

  return (
    <div className="group flex gap-3">
      {autor ? <Avatar persona={autor} tamano="md" /> : <span className="size-9 rounded-full bg-columna" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-texto">{autor?.nombre ?? "Usuario"}</span>
          <span className="text-xs text-tenue/80" title={new Date(comentario.creado_en).toLocaleString("es-VE")}>
            {haceCuanto(comentario.creado_en)}
          </span>
          {comentario.editado_en && <span className="text-[0.7rem] text-tenue/60">(editado)</span>}
          {comentario.es_mio && !editando && (
            <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Menu
                disparador={
                  <Boton variante="fantasma" tamano="icono-sm" aria-label="Opciones del comentario">
                    <Ellipsis />
                  </Boton>
                }
              >
                <ItemMenu icono={Pencil} onSelect={() => setEditando(true)}>
                  Editar
                </ItemMenu>
                <ItemMenu icono={Trash} peligro onSelect={() => borrar.mutate(comentario.id)}>
                  Eliminar
                </ItemMenu>
              </Menu>
            </span>
          )}
        </div>
        {editando ? (
          <div className="mt-1.5 space-y-2">
            <textarea
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-xl border border-morado/40 bg-white px-3 py-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <Boton
                tamano="sm"
                cargando={editar.isPending}
                onClick={async () => {
                  await editar.mutateAsync({ id: comentario.id, texto });
                  setEditando(false);
                }}
              >
                Guardar
              </Boton>
              <Boton tamano="sm" variante="fantasma" onClick={() => setEditando(false)}>
                Cancelar
              </Boton>
            </div>
          </div>
        ) : (
          <p className="mt-1 rounded-2xl rounded-tl-md bg-fondo px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-texto">
            {comentario.texto}
          </p>
        )}
      </div>
    </div>
  );
}
