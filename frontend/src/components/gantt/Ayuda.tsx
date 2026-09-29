/** «Mover sucesoras» y su ayuda: qué es una sucesora y cómo se crea. */

import { ArrowRight, Link2, Plus, X } from "lucide-react";
import { Popover } from "radix-ui";
import type { ReactNode } from "react";

import { useAyuda } from "@/hooks/useAyuda";
import { cn } from "@/lib/cn";

export function InterruptorSucesoras({ activo, onCambiar }: { activo: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambiar(!activo)}
      className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-tenue transition-colors hover:bg-fondo pointer-coarse:hidden"
    >
      <span className={cn("relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors", activo ? "bg-morado" : "bg-linea")}>
        <span className={cn("absolute size-3.5 rounded-full bg-white shadow transition-transform duration-200", activo ? "translate-x-4" : "translate-x-0.5")} />
      </span>
      Mover sucesoras
    </button>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h5 className="text-[0.7rem] font-bold tracking-[0.08em] text-tenue uppercase">{titulo}</h5>
      {children}
    </section>
  );
}

/**
 * Botón redondo «?» junto a «Mover sucesoras». Se abre con clic (y con el
 * dedo), no al pasar el ratón: es texto para leer con calma.
 */
export function AyudaSucesoras({ puede }: { puede: boolean }) {
  const ayuda = useAyuda();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="¿Qué son las sucesoras?"
          title="¿Qué son las sucesoras?"
          className="grid size-6 shrink-0 place-items-center rounded-full border border-linea bg-white text-xs font-bold text-tenue transition-colors hover:border-morado/40 hover:text-morado focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-morado data-[state=open]:border-morado data-[state=open]:bg-morado data-[state=open]:text-white pointer-coarse:size-8"
        >
          ?
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="flotante z-[60] w-[22rem] max-w-[calc(100vw-24px)] space-y-3.5 rounded-2xl border border-linea bg-white p-4 text-[0.8rem] leading-relaxed text-texto shadow-[0_24px_48px_-20px_rgba(20,22,68,0.5)]"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-sm font-semibold text-marino">Tareas encadenadas</p>
            <Popover.Close aria-label="Cerrar" className="-m-1 rounded-md p-1 text-tenue hover:bg-fondo hover:text-marino">
              <X className="size-4" />
            </Popover.Close>
          </div>

          <Seccion titulo="¿Qué es una sucesora?">
            <p>
              Una tarea que va <b>después</b> de otra (su predecesora). En el Gantt las une una flecha: la sucesora no puede
              empezar hasta que termine la anterior.
            </p>
          </Seccion>

          {puede && (
            <Seccion titulo="Cómo crear una">
              <ol className="space-y-1.5">
                <li className="flex gap-2">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-morado/10 text-[0.65rem] font-bold text-morado">1</span>
                  <span>
                    Pasa el ratón sobre una tarea de la lista y pulsa{" "}
                    <Plus className="inline size-3.5 rounded bg-morado/10 text-morado" aria-label="+" /> para crear otra que empiece
                    después.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-morado/10 text-[0.65rem] font-bold text-morado">2</span>
                  <span>
                    En <b>+ Tarea</b>, elige <b>Empieza después de</b>.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-morado/10 text-[0.65rem] font-bold text-morado">3</span>
                  <span>
                    Para enlazar dos que ya existen, arrastra desde el punto{" "}
                    <span className="inline-block size-2.5 rounded-full bg-morado align-middle" aria-hidden /> al final de una barra
                    hasta la otra.
                  </span>
                </li>
              </ol>
              <p className="flex items-center gap-1.5 pt-1 text-xs text-tenue">
                <Link2 className="size-3.5 shrink-0" />
                Haz clic en una flecha para cambiar el tipo, añadir días de espera o quitarla.
              </p>
            </Seccion>
          )}

          <Seccion titulo="Mover sucesoras">
            <p>
              <b>Activado:</b> si retrasas o alargas una tarea, sus sucesoras se corren hacia adelante (en días hábiles) lo
              justo para seguir después de ella, y conservan su duración.
            </p>
            <p>
              <b>Desactivado:</b> solo se mueve la que arrastras; si una sucesora queda antes de tiempo, su flecha se pone{" "}
              <span className="font-semibold text-[#dc2626]">roja punteada</span>.
            </p>
            <p className="text-xs text-tenue">Nunca mueve tareas terminadas ni sin fechas.</p>
          </Seccion>
          <Popover.Close asChild>
            <button
              type="button"
              onClick={() => ayuda.abrir("gantt", "sucesoras")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-morado hover:underline"
            >
              Ver la guía completa del Gantt
              <ArrowRight className="size-3.5" />
            </button>
          </Popover.Close>
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
