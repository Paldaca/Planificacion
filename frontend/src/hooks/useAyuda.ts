import { createContext, useContext, useEffect } from "react";

import type { Tema } from "@/components/ayuda/contenido";

/**
 * Centro de ayuda: cualquier componente puede abrirlo en un tema (y, si se
 * quiere, en una entrada concreta). Lo provee `ProveedorAyuda` en `App`.
 */
export type ContextoAyuda = {
  /** Sin tema, abre en el de la pantalla actual (`useTemaAyuda`). */
  abrir: (tema?: Tema, entrada?: string) => void;
  /** La pantalla actual declara su tema; `null` al salir de ella. */
  fijarTema: (tema: Tema | null) => void;
};

export const ContextoAyudaReact = createContext<ContextoAyuda>({ abrir: () => {}, fijarTema: () => {} });

export function useAyuda(): ContextoAyuda {
  return useContext(ContextoAyudaReact);
}

/** Tema con el que abre la ayuda mientras esta pantalla esté montada. */
export function useTemaAyuda(tema: Tema) {
  const { fijarTema } = useAyuda();
  useEffect(() => {
    fijarTema(tema);
    return () => fijarTema(null);
  }, [tema, fijarTema]);
}
