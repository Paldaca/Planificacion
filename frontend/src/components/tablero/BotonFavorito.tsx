import { Star } from "lucide-react";

import { useFavorito } from "@/api/favoritos";
import type { TableroResumen } from "@/api/tipos";
import { cn } from "@/lib/cn";

/**
 * Estrella para marcar un tablero como favorito (solo para quien la pulsa).
 * `discreta`: sin marcar, solo se ve al pasar el ratón por el `group` que la
 * contiene (en táctil, siempre).
 */
export function BotonFavorito({
  tablero,
  discreta = false,
  className,
}: {
  tablero: TableroResumen;
  discreta?: boolean;
  className?: string;
}) {
  const favorito = useFavorito();
  const activo = tablero.es_favorito;
  const texto = activo ? "Quitar de favoritos" : "Marcar como favorito";
  return (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={texto}
      title={texto}
      onClick={(e) => {
        // Dentro de un enlace o de una tarjeta clicable: no navegar.
        e.preventDefault();
        e.stopPropagation();
        favorito.mutate({ tablero, favorito: !activo });
      }}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-[color,background-color,opacity,transform] duration-150 active:scale-90 pointer-coarse:size-10",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-morado",
        activo ? "text-[#f59e0b] hover:bg-[#fef3c7]" : "text-tenue hover:bg-morado/8 hover:text-[#f59e0b]",
        discreta && !activo && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
        className,
      )}
    >
      <Star className={cn("size-[1.15rem]", activo && "fill-current")} />
    </button>
  );
}
