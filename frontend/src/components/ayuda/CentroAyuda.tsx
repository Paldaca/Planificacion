/**
 * Centro de ayuda: panel lateral con una guía por vista del tablero (Tablero,
 * Lista, Calendario, Gantt) y las preguntas frecuentes, con buscador. Se abre
 * con el botón «Ayuda» del tablero, con la tecla «?» o desde otras ayudas
 * (`useAyuda().abrir("gantt", "sucesoras")`). El texto vive en `contenido.ts`.
 */

import { CalendarDays, ChartGantt, ChevronDown, LifeBuoy, List, MessageCircleQuestion, Search, SquareKanban, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ContextoAyudaReact, type ContextoAyuda } from "@/hooks/useAyuda";
import { cn } from "@/lib/cn";

import { TEMAS, buscar, type EntradaAyuda, type Tema } from "./contenido";

const ICONOS: Record<Tema, typeof List> = {
  tablero: SquareKanban,
  lista: List,
  calendario: CalendarDays,
  gantt: ChartGantt,
  preguntas: MessageCircleQuestion,
};

/** Donde no se escribe, «?» abre la ayuda. */
function escribiendo(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false;
  return objetivo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(objetivo.tagName);
}

export function ProveedorAyuda({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [tema, setTema] = useState<Tema>("preguntas");
  const [entrada, setEntrada] = useState<string | null>(null);
  const temaPantalla = useRef<Tema | null>(null);

  const abrir = useCallback((t?: Tema, e?: string) => {
    setTema(t ?? temaPantalla.current ?? "preguntas");
    setEntrada(e ?? null);
    setAbierto(true);
  }, []);
  const fijarTema = useCallback((t: Tema | null) => {
    temaPantalla.current = t;
  }, []);
  const valor = useMemo<ContextoAyuda>(() => ({ abrir, fijarTema }), [abrir, fijarTema]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      abrir();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abrir]);

  return (
    <ContextoAyudaReact.Provider value={valor}>
      {children}
      <CentroAyuda
        abierto={abierto}
        onCambio={setAbierto}
        tema={tema}
        onTema={(t) => {
          setTema(t);
          setEntrada(null);
        }}
        entrada={entrada}
      />
    </ContextoAyudaReact.Provider>
  );
}

function CentroAyuda({
  abierto,
  onCambio,
  tema,
  onTema,
  entrada,
}: {
  abierto: boolean;
  onCambio: (v: boolean) => void;
  tema: Tema;
  onTema: (t: Tema) => void;
  entrada: string | null;
}) {
  const [consulta, setConsulta] = useState("");
  const cuerpo = useRef<HTMLDivElement>(null);
  const actual = TEMAS.find((t) => t.id === tema)!;
  const resultados = useMemo(() => buscar(consulta), [consulta]);
  const buscando = consulta.trim() !== "";

  // Cada tema empieza arriba (y la búsqueda se limpia al cerrar).
  useEffect(() => {
    cuerpo.current?.scrollTo({ top: 0 });
  }, [tema]);

  return (
    <Dialog.Root
      open={abierto}
      onOpenChange={(v) => {
        onCambio(v);
        if (!v) setConsulta("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialogo-fondo fixed inset-0 z-50 bg-marino/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className="cajon fixed inset-y-0 right-0 z-50 flex w-[min(460px,100vw)] flex-col border-l border-linea bg-white shadow-[-30px_0_60px_-30px_rgba(20,22,68,0.45)] focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="border-b border-linea/70 px-5 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-morado/10 text-morado">
                <LifeBuoy className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="font-display text-lg font-semibold tracking-tight text-marino">Centro de ayuda</Dialog.Title>
                <p className="text-sm text-tenue">Cómo usar cada vista y respuestas rápidas.</p>
              </div>
              <Dialog.Close
                className="rounded-lg p-1.5 text-tenue transition-colors hover:bg-morado/8 hover:text-morado pointer-coarse:p-2.5"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>

            <label className="mt-4 flex h-10 items-center gap-2 rounded-xl border border-linea bg-fondo/60 px-3 focus-within:border-morado/50 focus-within:bg-white">
              <Search className="size-4 shrink-0 text-tenue" />
              <input
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Buscar: exportar, sucesora, vencida…"
                aria-label="Buscar en la ayuda"
                className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-tenue/70 max-sm:text-base"
              />
              {buscando && (
                <button type="button" onClick={() => setConsulta("")} aria-label="Limpiar la búsqueda" className="rounded p-0.5 text-tenue hover:text-marino">
                  <X className="size-3.5" />
                </button>
              )}
            </label>

            {!buscando && (
              <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Temas de ayuda">
                {TEMAS.map((t) => {
                  const Icono = ICONOS[t.id];
                  const activo = t.id === tema;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={activo}
                      onClick={() => onTema(t.id)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors pointer-coarse:py-2",
                        activo ? "bg-morado text-white shadow-sm" : "text-tenue hover:bg-morado/8 hover:text-morado",
                      )}
                    >
                      <Icono className="size-3.5" />
                      {t.etiqueta}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div ref={cuerpo} className="flex-1 overflow-y-auto px-5 py-4">
            {buscando ? (
              resultados.length ? (
                <div className="space-y-2">
                  <p className="text-xs text-tenue">
                    {resultados.length === 1 ? "1 resultado" : `${resultados.length} resultados`}
                  </p>
                  {resultados.map(({ tema: t, entrada: e }) => (
                    <Entrada key={`${t.id}-${e.id}`} entrada={e} etiqueta={t.etiqueta} inicialAbierta />
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center">
                  <MessageCircleQuestion className="mx-auto mb-2 size-7 text-tenue/50" />
                  <p className="text-sm font-medium text-marino">Nada con «{consulta.trim()}»</p>
                  <p className="mt-1 text-sm text-tenue">Prueba con otra palabra o revisa las preguntas frecuentes.</p>
                </div>
              )
            ) : (
              <div key={tema} className="animate-fade space-y-2">
                <p className="mb-3 text-sm leading-relaxed text-texto">{actual.resumen}</p>
                {actual.entradas.map((e) => (
                  <Entrada key={e.id} entrada={e} inicialAbierta={e.id === entrada} enfocar={e.id === entrada} />
                ))}
              </div>
            )}
          </div>

          <p className="border-t border-linea/70 bg-fondo/60 px-5 py-3 text-xs text-tenue">
            Pulsa <kbd className="rounded border border-linea bg-white px-1 font-sans font-semibold text-marino">?</kbd> en
            cualquier momento para abrir esta ayuda.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Una pregunta o un «cómo se hace»: título que despliega su texto. */
function Entrada({
  entrada,
  etiqueta,
  inicialAbierta = false,
  enfocar = false,
}: {
  entrada: EntradaAyuda;
  /** Tema al que pertenece (en los resultados de búsqueda). */
  etiqueta?: string;
  inicialAbierta?: boolean;
  enfocar?: boolean;
}) {
  const [abierta, setAbierta] = useState(inicialAbierta);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enfocar) ref.current?.scrollIntoView({ block: "start" });
  }, [enfocar]);
  const id = `ayuda-${etiqueta ?? ""}-${entrada.id}`;
  return (
    <div ref={ref} className={cn("rounded-xl border transition-colors", abierta ? "border-morado/25 bg-morado/[0.03]" : "border-linea")}>
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={id}
        onClick={() => setAbierta(!abierta)}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          {etiqueta && <span className="mb-0.5 block text-[0.68rem] font-bold tracking-[0.08em] text-tenue uppercase">{etiqueta}</span>}
          <span className="text-sm font-semibold text-marino">{entrada.titulo}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-tenue transition-transform duration-200", abierta && "rotate-180")} />
      </button>
      {abierta && (
        <div id={id} className="space-y-2 px-3.5 pb-3.5 text-sm leading-relaxed text-texto">
          <Parrafos parrafos={entrada.parrafos} />
        </div>
      )}
    </div>
  );
}

/** Párrafos y puntos de lista («• ») consecutivos agrupados en una lista. */
function Parrafos({ parrafos }: { parrafos: string[] }) {
  const bloques: (string | string[])[] = [];
  for (const p of parrafos) {
    if (p.startsWith("• ")) {
      const ultimo = bloques.at(-1);
      if (Array.isArray(ultimo)) ultimo.push(p.slice(2));
      else bloques.push([p.slice(2)]);
    } else bloques.push(p);
  }
  return bloques.map((b, i) =>
    Array.isArray(b) ? (
      <ul key={i} className="space-y-1 pl-1">
        {b.map((item, j) => (
          <li key={j} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-morado/50" />
            <span>
              <Negritas texto={item} />
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p key={i}>
        <Negritas texto={b} />
      </p>
    ),
  );
}

function Negritas({ texto }: { texto: string }) {
  return texto.split("**").map((trozo, i) =>
    i % 2 ? (
      <b key={i} className="font-semibold text-marino">
        {trozo}
      </b>
    ) : (
      <Fragment key={i}>{trozo}</Fragment>
    ),
  );
}
