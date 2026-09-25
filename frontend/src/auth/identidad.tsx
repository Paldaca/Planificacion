import type { ReactNode } from "react";

import { IdentidadContext } from "./useIdentidad";
import type { Identity } from "./useIdentity";

export function IdentidadProvider({ identidad, children }: { identidad: Identity; children: ReactNode }) {
  return <IdentidadContext.Provider value={identidad}>{children}</IdentidadContext.Provider>;
}
