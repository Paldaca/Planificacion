import { createContext, useContext, type ReactNode } from "react";

import type { Identity } from "./useIdentity";

const IdentidadContext = createContext<Identity | null>(null);

export function IdentidadProvider({ identidad, children }: { identidad: Identity; children: ReactNode }) {
  return <IdentidadContext.Provider value={identidad}>{children}</IdentidadContext.Provider>;
}

/** Usuario actual. Solo existe dentro de la app autenticada (ver App.tsx). */
export function useIdentidad(): Identity {
  const valor = useContext(IdentidadContext);
  if (!valor) throw new Error("useIdentidad fuera de IdentidadProvider");
  return valor;
}

export function nombreVisible(identidad: Identity): string {
  return [identidad.first_name, identidad.last_name].filter(Boolean).join(" ") || identidad.username;
}
