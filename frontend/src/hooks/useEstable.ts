import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Función con identidad estable que siempre ejecuta la versión más reciente
 * de `fn`. Sirve para pasar manejadores a filas memoizadas (el Gantt tiene
 * cientos) sin que cada render de la vista las vuelva a pintar todas.
 * Solo para manejadores de eventos: no llamarla durante el render.
 */
export function useEstable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
