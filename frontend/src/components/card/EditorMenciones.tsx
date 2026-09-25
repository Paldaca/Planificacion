import { AtSign } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { Persona } from "@/api/tipos";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

/** Texto antes del cursor que termina en "@algo": lo que se está mencionando. */
const MENCION_EN_CURSO = /(^|\s)@([\w.-]*)$/;

export type EditorMencionesRef = { enfocar: () => void };

type Props = {
  valor: string;
  onCambio: (valor: string) => void;
  onEnviar: () => void;
  personas: Persona[];
  marcador?: string;
  filas?: number;
  autoFocus?: boolean;
  className?: string;
};

/**
 * Área de texto con autocompletado de `@usuario`. El backend reconoce la
 * mención por el nombre de usuario exacto, así que el autocompletado inserta
 * siempre `@username` (el nombre visible solo se muestra en la lista).
 */
export const EditorMenciones = forwardRef<EditorMencionesRef, Props>(function EditorMenciones(
  { valor, onCambio, onEnviar, personas, marcador, filas = 2, autoFocus, className },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [consulta, setConsulta] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);

  useImperativeHandle(ref, () => ({ enfocar: () => area.current?.focus() }), []);

  const sugerencias = useMemo(() => {
    if (consulta === null) return [];
    const q = consulta.toLowerCase();
    return personas
      .filter((p) => p.username.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))
      .slice(0, 6);
  }, [consulta, personas]);

  function detectar(texto: string, cursor: number) {
    const coincidencia = MENCION_EN_CURSO.exec(texto.slice(0, cursor));
    setConsulta(coincidencia ? coincidencia[2] : null);
    setIndice(0);
  }

  function elegir(persona: Persona) {
    const el = area.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const antes = valor.slice(0, cursor).replace(MENCION_EN_CURSO, (_m, espacio: string) => `${espacio}@${persona.username} `);
    const nuevo = antes + valor.slice(cursor);
    onCambio(nuevo);
    setConsulta(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(antes.length, antes.length);
    });
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (sugerencias.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const paso = e.key === "ArrowDown" ? 1 : -1;
        setIndice((i) => (i + paso + sugerencias.length) % sugerencias.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        elegir(sugerencias[indice]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // que no cierre la tarjeta
        setConsulta(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onEnviar();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={area}
        value={valor}
        rows={filas}
        maxLength={5000}
        autoFocus={autoFocus}
        placeholder={marcador}
        onChange={(e) => {
          onCambio(e.target.value);
          detectar(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={alTeclear}
        onClick={(e) => detectar(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => window.setTimeout(() => setConsulta(null), 120)}
        role="combobox"
        aria-expanded={sugerencias.length > 0}
        aria-autocomplete="list"
        className={className}
      />
      <AnimatePresence>
        {sugerencias.length > 0 && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-2 z-20 mb-1.5 w-64 overflow-hidden rounded-xl border border-linea bg-white p-1 shadow-[0_18px_38px_-18px_rgba(20,22,68,0.45)]"
          >
            <li className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-[0.68rem] font-bold tracking-wide text-tenue uppercase">
              <AtSign className="size-3" />
              Mencionar
            </li>
            {sugerencias.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === indice}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(p);
                  }}
                  onMouseEnter={() => setIndice(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    i === indice ? "bg-morado/8" : "",
                  )}
                >
                  <Avatar persona={p} tamano="xs" conTooltip={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-texto">{p.nombre}</span>
                    <span className="block truncate text-[0.7rem] text-tenue">@{p.username}</span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
});

/** Pinta el texto de un comentario resaltando las menciones válidas. */
export function TextoConMenciones({ texto, menciones }: { texto: string; menciones: Persona[] }) {
  if (!menciones.length) return <>{texto}</>;
  const porUsuario = new Map(menciones.map((p) => [p.username.toLowerCase(), p]));
  const partes = texto.split(/(@[\w.-]+)/g);
  return (
    <>
      {partes.map((parte, i) => {
        const persona = parte.startsWith("@") ? porUsuario.get(parte.slice(1).replace(/\.$/, "").toLowerCase()) : undefined;
        return persona ? (
          <span
            key={i}
            className="rounded-md bg-morado/10 px-1 py-px font-semibold text-morado"
            title={persona.nombre}
          >
            {parte}
          </span>
        ) : (
          <span key={i}>{parte}</span>
        );
      })}
    </>
  );
}
