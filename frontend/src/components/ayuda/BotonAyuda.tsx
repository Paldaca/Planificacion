/**
 * Botón redondo «?» que abre una explicación corta junto a lo que explica
 * (con clic, también en el teléfono) y, opcionalmente, un enlace a la guía
 * completa del Centro de ayuda. Funciona dentro de diálogos: Radix apila el
 * globo sobre el diálogo sin cerrarlo.
 */

import { ArrowRight, X } from "lucide-react";
import { Popover } from "radix-ui";
import type { ReactNode } from "react";

import { useAyuda } from "@/hooks/useAyuda";

import type { Tema } from "./contenido";

export function BotonAyuda({
  etiqueta,
  titulo,
  children,
  guia,
  align = "start",
}: {
  /** Texto del botón para lectores de pantalla y el `title`. */
  etiqueta: string;
  titulo: string;
  children: ReactNode;
  /** Entrada del Centro de ayuda con la explicación completa. */
  guia?: { tema: Tema; entrada?: string };
  align?: "start" | "center" | "end";
}) {
  const ayuda = useAyuda();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={etiqueta}
          title={etiqueta}
          className="grid size-6 shrink-0 place-items-center rounded-full border border-linea bg-white text-xs font-bold text-tenue transition-colors hover:border-morado/40 hover:text-morado focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-morado data-[state=open]:border-morado data-[state=open]:bg-morado data-[state=open]:text-white pointer-coarse:size-8"
        >
          ?
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="flotante z-[60] w-[22rem] max-w-[calc(100vw-24px)] space-y-3.5 rounded-2xl border border-linea bg-white p-4 text-[0.8rem] leading-relaxed text-texto shadow-[0_24px_48px_-20px_rgba(20,22,68,0.5)]"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-sm font-semibold text-marino">{titulo}</p>
            <Popover.Close aria-label="Cerrar" className="-m-1 rounded-md p-1 text-tenue hover:bg-fondo hover:text-marino">
              <X className="size-4" />
            </Popover.Close>
          </div>
          {children}
          {guia && (
            <Popover.Close asChild>
              <button
                type="button"
                onClick={() => ayuda.abrir(guia.tema, guia.entrada)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-morado hover:underline"
              >
                Ver la guía completa
                <ArrowRight className="size-3.5" />
              </button>
            </Popover.Close>
          )}
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Subtítulo en mayúsculas pequeñas para separar partes de la explicación. */
export function SeccionAyuda({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h5 className="text-[0.7rem] font-bold tracking-[0.08em] text-tenue uppercase">{titulo}</h5>
      {children}
    </section>
  );
}
