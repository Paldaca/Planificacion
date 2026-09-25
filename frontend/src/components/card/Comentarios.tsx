import { Ellipsis, Pencil, Send, Trash } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { useBorrarComentario, useComentarios, useCrearComentario, useEditarComentario } from "@/api/queries";
import type { Comentario, Persona } from "@/api/tipos";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto } from "@/components/ui/Estados";
import { ItemMenu, Menu } from "@/components/ui/Menu";
import { haceCuanto } from "@/lib/fechas";

import { EditorMenciones, TextoConMenciones } from "./EditorMenciones";

const ESTILO_EDITOR =
  "block w-full resize-none rounded-2xl bg-transparent px-3.5 pt-3 text-sm text-texto outline-none placeholder:text-tenue/60";

export function Comentarios({
  tableroId,
  cardId,
  yo,
  puedeComentar,
  personas,
}: {
  tableroId: number;
  cardId: number;
  yo: Persona;
  puedeComentar: boolean;
  personas: Persona[];
}) {
  const { data: comentarios, isLoading } = useComentarios(cardId);
  const crear = useCrearComentario(tableroId, cardId);
  const [texto, setTexto] = useState("");
  const mencionables = personas.filter((p) => p.id !== yo.id);

  async function enviar() {
    const limpio = texto.trim();
    if (!limpio || crear.isPending) return;
    await crear.mutateAsync(limpio);
    setTexto("");
  }

  return (
    <div>
      {puedeComentar && (
        <div className="mb-5 flex gap-3">
          <Avatar persona={yo} tamano="md" conTooltip={false} />
          <div className="flex-1 rounded-2xl border border-linea bg-white transition-shadow focus-within:border-morado/50 focus-within:shadow-[0_0_0_4px_rgba(50,64,123,0.08)]">
            <EditorMenciones
              valor={texto}
              onCambio={setTexto}
              onEnviar={() => void enviar()}
              personas={mencionables}
              marcador="Escribe un comentario… usa @ para mencionar a alguien"
              className={ESTILO_EDITOR}
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <span className="text-[0.7rem] text-tenue/70">@ menciona · Ctrl + Enter envía</span>
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
                <ItemComentario comentario={c} tableroId={tableroId} cardId={cardId} personas={mencionables} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="rounded-xl bg-fondo px-4 py-5 text-center text-sm text-tenue">Todavía no hay comentarios.</p>
      )}
    </div>
  );
}

function ItemComentario({
  comentario,
  tableroId,
  cardId,
  personas,
}: {
  comentario: Comentario;
  tableroId: number;
  cardId: number;
  personas: Persona[];
}) {
  const editar = useEditarComentario(cardId);
  const borrar = useBorrarComentario(tableroId, cardId);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(comentario.texto);
  const autor = comentario.autor;

  if (comentario.eliminado) {
    return <p className="pl-12 text-xs text-tenue/70 italic">Comentario eliminado</p>;
  }

  async function guardar() {
    const limpio = texto.trim();
    if (!limpio) return;
    await editar.mutateAsync({ id: comentario.id, texto: limpio });
    setEditando(false);
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
                <ItemMenu
                  icono={Pencil}
                  onSelect={() => {
                    setTexto(comentario.texto);
                    setEditando(true);
                  }}
                >
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
            <div className="rounded-xl border border-morado/40 bg-white">
              <EditorMenciones
                valor={texto}
                onCambio={setTexto}
                onEnviar={() => void guardar()}
                personas={personas}
                filas={3}
                autoFocus
                className="block w-full resize-y rounded-xl bg-transparent px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Boton tamano="sm" cargando={editar.isPending} onClick={() => void guardar()}>
                Guardar
              </Boton>
              <Boton tamano="sm" variante="fantasma" onClick={() => setEditando(false)}>
                Cancelar
              </Boton>
            </div>
          </div>
        ) : (
          <p className="mt-1 rounded-2xl rounded-tl-md bg-fondo px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-texto">
            <TextoConMenciones texto={comentario.texto} menciones={comentario.menciones} />
          </p>
        )}
      </div>
    </div>
  );
}
