import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
  abierto: boolean;
  onCambio: (abierto: boolean) => void;
  titulo: string;
  descripcion?: string;
  icono?: LucideIcon;
  color?: string;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: "sm" | "md" | "lg";
};

const ANCHOS = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

/** Diálogo con la misma anatomía que `Modal.tsx` del Portal, animado. */
export function Dialogo({
  abierto,
  onCambio,
  titulo,
  descripcion,
  icono: Icono,
  color = "#32407b",
  children,
  pie,
  ancho = "md",
}: Props) {
  return (
    <Dialog.Root open={abierto} onOpenChange={onCambio}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialogo-fondo fixed inset-0 z-50 bg-marino/45 backdrop-blur-[3px]" />
        <Dialog.Content
          className={cn(
            "dialogo-panel fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
            "rounded-[22px] border border-linea bg-white shadow-[0_30px_60px_-24px_rgba(20,22,68,0.45)] focus:outline-none",
            ANCHOS[ancho],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-linea/70 px-6 pt-5 pb-4">
            <div className="flex items-start gap-3">
              {Icono && (
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: `color-mix(in srgb, ${color} 12%, #fff)`, color }}
                >
                  <Icono className="size-5" />
                </div>
              )}
              <div>
                <Dialog.Title className="font-display text-lg font-semibold tracking-tight text-marino">
                  {titulo}
                </Dialog.Title>
                {descripcion ? (
                  <Dialog.Description className="mt-0.5 text-sm text-tenue">{descripcion}</Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{titulo}</Dialog.Description>
                )}
              </div>
            </div>
            <Dialog.Close
              className="rounded-lg p-1.5 text-tenue transition-colors hover:bg-morado/8 hover:text-morado"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {pie && <div className="flex justify-end gap-2 border-t border-linea/70 bg-fondo/60 px-6 py-4">{pie}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
