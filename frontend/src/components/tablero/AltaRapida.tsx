import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Boton } from "@/components/ui/Boton";

/** "+ Añadir tarjeta": Enter crea y deja el campo listo para la siguiente. */
export function AltaRapida({
  onCrear,
  creando,
  texto = "Añadir tarjeta",
  marcador = "¿Qué hay que hacer?",
}: {
  onCrear: (titulo: string) => Promise<unknown> | void;
  creando?: boolean;
  texto?: string;
  marcador?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (abierto) ref.current?.focus();
  }, [abierto]);

  async function enviar() {
    const limpio = titulo.trim();
    if (!limpio) return;
    setTitulo("");
    await onCrear(limpio);
    ref.current?.focus();
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      {abierto ? (
        <motion.div
          key="form"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="space-y-2 pt-1">
            <textarea
              ref={ref}
              value={titulo}
              rows={2}
              maxLength={200}
              placeholder={marcador}
              onChange={(e) => setTitulo(e.target.value.replace(/\n/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void enviar();
                }
                if (e.key === "Escape") {
                  setAbierto(false);
                  setTitulo("");
                }
              }}
              onBlur={() => {
                if (!titulo.trim()) setAbierto(false);
              }}
              className="w-full resize-none rounded-[14px] border border-morado/30 bg-white px-3.5 py-2.5 text-sm text-texto shadow-[0_0_0_4px_rgba(50,64,123,0.08)] outline-none placeholder:text-tenue/60"
            />
            <div className="flex items-center gap-2">
              <Boton tamano="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => void enviar()} cargando={creando}>
                Añadir
              </Boton>
              <Boton
                tamano="sm"
                variante="fantasma"
                onClick={() => {
                  setAbierto(false);
                  setTitulo("");
                }}
              >
                Cancelar
              </Boton>
              <span className="ml-auto hidden text-[0.7rem] text-tenue/70 sm:block">Enter para añadir</span>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.button
          key="boton"
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setAbierto(true)}
          className="group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-tenue transition-colors hover:bg-white/80 hover:text-morado"
        >
          <Plus className="size-4 transition-transform duration-200 group-hover:rotate-90" />
          {texto}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
