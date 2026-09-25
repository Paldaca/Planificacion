import { createContext, useContext } from "react";

import type { Identity } from "./useIdentity";

export const IdentidadContext = createContext<Identity | null>(null);

/** Usuario actual. Solo existe dentro de la app autenticada (ver App.tsx). */
export function useIdentidad(): Identity {
  const valor = useContext(IdentidadContext);
  if (!valor) throw new Error("useIdentidad fuera de IdentidadProvider");
  return valor;
}

export function nombreVisible(identidad: Identity): string {
  return [identidad.first_name, identidad.last_name].filter(Boolean).join(" ") || identidad.username;
}
