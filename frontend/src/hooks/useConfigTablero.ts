import { createContext, useContext, useMemo } from "react";

import type { CampoPersonalizado, Dependencia, Etiqueta, TableroDetalle } from "@/api/tipos";

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
  /** Por tarjeta, los números de sus predecesoras sin terminar («Espera a #12»). */
  esperando: Map<number, number[]>;
};

export const ContextoConfigTablero = createContext<ConfigTablero>({
  etiquetas: new Map(),
  campos: [],
  camposVisibles: [],
  esperando: new Map(),
});

export function useConfigTablero(): ConfigTablero {
  return useContext(ContextoConfigTablero);
}

/** El valor del contexto a partir del detalle del tablero y sus dependencias. */
export function useValorConfigTablero(
  tablero: TableroDetalle | undefined,
  dependencias: Dependencia[] | undefined,
): ConfigTablero {
  // Las tarjetas cambian con cada edición; el contexto solo cuando cambia quién
  // espera a quién (si no, cada cambio volvería a pintar todas las tarjetas).
  const firma = useMemo(() => {
    const porId = new Map((tablero?.cards ?? []).map((c) => [c.id, c]));
    const pares: string[] = [];
    for (const d of dependencias ?? []) {
      const antes = porId.get(d.predecesora);
      if (antes && antes.vencimiento !== "terminada" && porId.has(d.sucesora)) pares.push(`${d.sucesora}:${antes.numero}`);
    }
    return pares.sort().join(",");
  }, [tablero?.cards, dependencias]);
  const esperando = useMemo(() => {
    const mapa = new Map<number, number[]>();
    for (const par of firma ? firma.split(",") : []) {
      const [card, numero] = par.split(":").map(Number);
      mapa.set(card, [...(mapa.get(card) ?? []), numero].sort((a, b) => a - b));
    }
    return mapa;
  }, [firma]);

  return useMemo(() => {
    const campos = (tablero?.campos ?? []).filter((c) => !c.archivado);
    return {
      etiquetas: new Map((tablero?.etiquetas ?? []).map((e) => [e.id, e])),
      campos,
      camposVisibles: campos.filter((c) => c.visible_en_tarjeta),
      esperando,
    };
  }, [tablero?.campos, tablero?.etiquetas, esperando]);
}

/** Texto de un valor para mostrar (números con separador local). */
export function textoValor(campo: CampoPersonalizado, valor: string | number | undefined): string {
  if (valor === undefined || valor === "") return "";
  if (campo.tipo === "numero" && typeof valor === "number") return valor.toLocaleString("es-VE");
  return String(valor);
}
