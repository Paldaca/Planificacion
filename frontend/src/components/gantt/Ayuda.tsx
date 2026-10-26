/** «Mover sucesoras» y su ayuda: qué es una sucesora y cómo se crea. */

import { Link2, Plus } from "lucide-react";

import { BotonAyuda, SeccionAyuda } from "@/components/ayuda/BotonAyuda";
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

/**
 * Botón redondo «?» junto a «Mover sucesoras». Se abre con clic (y con el
 * dedo), no al pasar el ratón: es texto para leer con calma.
 */
export function AyudaSucesoras({ puede }: { puede: boolean }) {
  return (
    <BotonAyuda etiqueta="¿Qué son las sucesoras?" titulo="Tareas encadenadas" guia={{ tema: "gantt", entrada: "sucesoras" }}>
      <SeccionAyuda titulo="¿Qué es una sucesora?">
        <p>
          Una tarea que va <b>después</b> de otra (su predecesora). En el Gantt las une una flecha: la sucesora no puede
          empezar hasta que termine la anterior.
        </p>
      </SeccionAyuda>

      {puede && (
        <SeccionAyuda titulo="Cómo crear una">
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
                hasta la otra, o abre la tarjeta y usa <b>Enlazar tarjeta</b> en <b>Dependencias</b>.
              </span>
            </li>
          </ol>
          <p className="flex items-center gap-1.5 pt-1 text-xs text-tenue">
            <Link2 className="size-3.5 shrink-0" />
            Haz clic en una flecha para cambiar el tipo, añadir días de espera o quitarla.
          </p>
        </SeccionAyuda>
      )}

      <SeccionAyuda titulo="Mover sucesoras">
        <p>
          <b>Activado:</b> si retrasas o alargas una tarea, sus sucesoras se corren hacia adelante (en días hábiles) lo
          justo para seguir después de ella, y conservan su duración.
        </p>
        <p>
          <b>Desactivado:</b> solo se mueve la que arrastras; si una sucesora queda antes de tiempo, su flecha se pone{" "}
          <span className="font-semibold text-[#dc2626]">roja punteada</span>.
        </p>
        <p className="text-xs text-tenue">Nunca mueve tareas terminadas ni sin fechas.</p>
      </SeccionAyuda>
    </BotonAyuda>
  );
}
