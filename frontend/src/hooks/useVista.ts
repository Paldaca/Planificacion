import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import type { Vista } from "@/api/tipos";

const VISTAS: Vista[] = ["tablero", "lista", "calendario", "gantt"];

const clave = (tableroId: number) => `planificacion:vista:${tableroId}`;

function recordada(tableroId: number): Vista | null {
  try {
    const valor = localStorage.getItem(clave(tableroId));
    return VISTAS.includes(valor as Vista) ? (valor as Vista) : null;
  } catch {
    return null;
  }
}

/**
 * Vista activa del tablero: `?vista=` en la URL (enlazable, el Portal la
 * refleja) y, si no viene, la última que usó esta persona en este tablero.
 */
export function useVista(tableroId: number): [Vista, (vista: Vista) => void] {
  const [params, setParams] = useSearchParams();
  const enUrl = params.get("vista") as Vista | null;
  const vista: Vista = enUrl && VISTAS.includes(enUrl) ? enUrl : (recordada(tableroId) ?? "tablero");

  const cambiar = useCallback(
    (nueva: Vista) => {
      try {
        localStorage.setItem(clave(tableroId), nueva);
      } catch {
        // Almacenamiento bloqueado: la URL sigue mandando.
      }
      setParams(
        (actual) => {
          const siguiente = new URLSearchParams(actual);
          if (nueva === "tablero") siguiente.delete("vista");
          else siguiente.set("vista", nueva);
          return siguiente;
        },
        { replace: true },
      );
    },
    [setParams, tableroId],
  );

  return [vista, cambiar];
}
