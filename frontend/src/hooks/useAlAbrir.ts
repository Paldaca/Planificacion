import { useState } from "react";

/**
 * Ejecuta `reiniciar` en el render en que `abierto` pasa a true: el patrón
 * que React recomienda para reiniciar estado cuando cambia una prop, en vez
 * de un efecto (que pinta primero el estado viejo y vuelve a renderizar).
 * Útil en diálogos cuyo contenido debe quedar limpio cada vez que se abren
 * sin desmontarlos (así conservan su animación de cierre).
 */
export function useAlAbrir(abierto: boolean, reiniciar: () => void) {
  const [previo, setPrevio] = useState(abierto);
  if (abierto !== previo) {
    setPrevio(abierto);
    if (abierto) reiniciar();
  }
}
