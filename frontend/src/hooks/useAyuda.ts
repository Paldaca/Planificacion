import { createContext, useContext, useEffect } from "react";

import type { GuiaTablero } from "@/api/tipos";
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
  /** El tablero abierto declara su guía propia (si su plantilla la trae); `null` al salir. */
  fijarGuia: (guia: GuiaTablero | null) => void;
};

export const ContextoAyudaReact = createContext<ContextoAyuda>({ abrir: () => {}, fijarTema: () => {}, fijarGuia: () => {} });

export function useAyuda(): ContextoAyuda {
  return useContext(ContextoAyudaReact);
}

/** Guía propia del tablero abierto: una pestaña más del Centro de ayuda mientras esté montado. */
export function useGuiaAyuda(guia: GuiaTablero | null) {
  const { fijarGuia } = useAyuda();
  useEffect(() => {
    fijarGuia(guia);
    return () => fijarGuia(null);
  }, [guia, fijarGuia]);
}

/** Tema con el que abre la ayuda mientras esta pantalla esté montada. */
export function useTemaAyuda(tema: Tema) {
  const { fijarTema } = useAyuda();
  useEffect(() => {
    fijarTema(tema);
    return () => fijarTema(null);
  }, [tema, fijarTema]);
}
