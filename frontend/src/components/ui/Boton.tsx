import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Variante = "primario" | "secundario" | "fantasma" | "peligro" | "suave";
type Tamano = "sm" | "md" | "icono" | "icono-sm";

const VARIANTES: Record<Variante, string> = {
  primario:
    "bg-morado text-white shadow-[0_6px_16px_-8px_rgba(50,64,123,0.7)] hover:bg-marino hover:shadow-[0_10px_22px_-10px_rgba(20,22,68,0.8)]",
  secundario: "bg-white text-texto border border-linea hover:border-morado/40 hover:bg-[#f7f8fd]",
  fantasma: "text-tenue hover:bg-morado/8 hover:text-morado",
  peligro: "bg-white text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] hover:border-[#fca5a5]",
  suave: "bg-morado/8 text-morado hover:bg-morado/14",
};

/** Con pantalla táctil (`pointer-coarse`) los botones crecen hasta ~40 px: el
 * dedo no acierta en 28–32 px. Con ratón no cambia nada. */
const TAMANOS: Record<Tamano, string> = {
  sm: "h-8 px-3 text-[0.82rem] gap-1.5 rounded-lg pointer-coarse:h-10",
  md: "h-10 px-4 text-sm gap-2 rounded-xl pointer-coarse:h-11",
  icono: "size-9 rounded-xl pointer-coarse:size-10",
  "icono-sm": "size-7 rounded-lg pointer-coarse:size-9",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
};

export function Boton({
  variante = "primario",
  tamano = "md",
  cargando = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-all duration-200 ease-suave active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-morado",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...props}
    >
      {cargando ? <LoaderCircle className="animate-spin" /> : null}
      {children}
    </button>
  );
}
