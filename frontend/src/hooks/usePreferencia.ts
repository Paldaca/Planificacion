import { useCallback, useState } from "react";

/** Preferencia de interfaz recordada en este navegador (zoom, agrupación…). */
export function usePreferencia<T extends string | boolean>(clave: string, defecto: T, validas?: readonly T[]) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = localStorage.getItem(`planificacion:${clave}`);
      if (guardado === null) return defecto;
      const leido = JSON.parse(guardado) as T;
      return !validas || validas.includes(leido) ? leido : defecto;
    } catch {
      return defecto;
    }
  });
  const cambiar = useCallback(
    (nuevo: T) => {
      setValor(nuevo);
      try {
        localStorage.setItem(`planificacion:${clave}`, JSON.stringify(nuevo));
      } catch {
        // Almacenamiento bloqueado: vale solo para esta visita.
      }
    },
    [clave],
  );
  return [valor, cambiar] as const;
}
