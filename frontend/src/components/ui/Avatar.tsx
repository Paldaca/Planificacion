import { Tooltip } from "radix-ui";

import type { Persona } from "@/api/tipos";
import { cn } from "@/lib/cn";
import { colorAvatar } from "@/lib/estilos";

const TAMANOS = {
  xs: "size-6 text-[0.62rem]",
  sm: "size-7 text-[0.68rem]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
};

export function Avatar({
  persona,
  tamano = "sm",
  className,
  conTooltip = true,
}: {
  persona: Persona;
  tamano?: keyof typeof TAMANOS;
  className?: string;
  conTooltip?: boolean;
}) {
  const circulo = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide text-white ring-2 ring-white select-none",
        TAMANOS[tamano],
        className,
      )}
      style={{ background: colorAvatar(persona.id) }}
      aria-label={persona.nombre}
    >
      {persona.iniciales}
    </span>
  );
  if (!conTooltip) return circulo;
  return (
    <Tooltip.Root delayDuration={250}>
      <Tooltip.Trigger asChild>{circulo}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="flotante z-[60] rounded-lg bg-marino px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {persona.nombre}
          {persona.disciplina ? <span className="text-white/60"> · {persona.disciplina}</span> : null}
          <Tooltip.Arrow className="fill-marino" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function PilaAvatares({
  personas,
  max = 3,
  tamano = "xs",
}: {
  personas: Persona[];
  max?: number;
  tamano?: keyof typeof TAMANOS;
}) {
  if (!personas.length) return null;
  const visibles = personas.slice(0, max);
  const resto = personas.length - visibles.length;
  return (
    <div className="flex -space-x-1.5">
      {visibles.map((p) => (
        <Avatar key={p.id} persona={p} tamano={tamano} />
      ))}
      {resto > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-columna font-semibold text-tenue ring-2 ring-white",
            TAMANOS[tamano],
          )}
        >
          +{resto}
        </span>
      )}
    </div>
  );
}
