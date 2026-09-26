import { createContext, useContext, useMemo } from "react";

import type { CampoPersonalizado, Etiqueta, TableroDetalle } from "@/api/tipos";

/**
 * Configuración del tablero que necesitan las tarjetas para dibujarse
 * (fase 5): etiquetas por id y campos que se ven en la tarjeta. La provee
 * `TableroPage`; fuera de un tablero (Mis tareas, archivadas) queda vacía.
 */
export type ConfigTablero = {
  etiquetas: Map<number, Etiqueta>;
  /** Campos activos, en orden. */
  campos: CampoPersonalizado[];
  camposVisibles: CampoPersonalizado[];
};

export const ContextoConfigTablero = createContext<ConfigTablero>({
  etiquetas: new Map(),
  campos: [],
  camposVisibles: [],
});

export function useConfigTablero(): ConfigTablero {
  return useContext(ContextoConfigTablero);
}

/** El valor del contexto a partir del detalle del tablero. */
export function useValorConfigTablero(tablero: TableroDetalle | undefined): ConfigTablero {
  return useMemo(() => {
    const campos = (tablero?.campos ?? []).filter((c) => !c.archivado);
    return {
      etiquetas: new Map((tablero?.etiquetas ?? []).map((e) => [e.id, e])),
      campos,
      camposVisibles: campos.filter((c) => c.visible_en_tarjeta),
    };
  }, [tablero?.campos, tablero?.etiquetas]);
}

/** Texto de un valor para mostrar (números con separador local). */
export function textoValor(campo: CampoPersonalizado, valor: string | number | undefined): string {
  if (valor === undefined || valor === "") return "";
  if (campo.tipo === "numero" && typeof valor === "number") return valor.toLocaleString("es-VE");
  return String(valor);
}
