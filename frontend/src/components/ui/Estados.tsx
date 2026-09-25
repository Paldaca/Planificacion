import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Estado vacío con la misma voz visual que las tarjetas del Home del Portal. */
export function Vacio({
  icono: Icono,
  titulo,
  texto,
  accion,
  className,
}: {
  icono: LucideIcon;
  titulo: string;
  texto?: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex animate-rise flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-linea bg-white/70 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-morado/8 text-morado">
        <Icono className="size-7" />
      </div>
      <h3 className="font-display text-lg font-semibold text-marino">{titulo}</h3>
      {texto && <p className="max-w-sm text-sm leading-relaxed text-tenue">{texto}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

export function Esqueleto({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("esqueleto", className)} style={style} />;
}

/** Etiqueta en píldora (estilo `.pd-home-meta-pill` del Portal). */
export function Pildora({
  children,
  color,
  className,
  icono: Icono,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  icono?: LucideIcon;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.72rem] font-semibold tracking-normal whitespace-nowrap normal-case",
        !color && "bg-columna text-tenue",
        className,
      )}
      style={color ? { background: `color-mix(in srgb, ${color} 12%, #fff)`, color } : undefined}
    >
      {Icono && <Icono className="size-3" />}
      {children}
    </span>
  );
}
