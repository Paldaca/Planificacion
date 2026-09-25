import { useEffect } from "react";

/** Título del documento; el shell del Portal lo recibe en los mensajes `navigate`. */
export function useTitulo(titulo: string | undefined) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · Planificación` : "Planificación";
  }, [titulo]);
}
