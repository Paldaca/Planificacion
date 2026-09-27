import { useEffect, useReducer } from "react";

/**
 * Carga diferida de una vista pesada (Gantt, Calendario) **sin Suspense**.
 *
 * Con `lazy()` + `<Suspense>`, React 19 enseña el esqueleto y retrasa hasta
 * 300 ms la aparición del contenido que suspendió (para agrupar revelados),
 * aunque el código ya estuviera descargado: al abrir un tablero directo en
 * `?vista=gantt` los datos llegaban y el Gantt seguía sin pintarse. Aquí, si
 * el módulo ya llegó, la vista se pinta en el mismo render que los datos.
 */
export type ModuloDiferido<T> = {
  /** Pide el módulo (una sola vez; se puede llamar para precargar). */
  cargar: () => Promise<T>;
  /** El módulo si ya llegó. */
  listo: () => T | null;
};

export function moduloDiferido<T>(importar: () => Promise<T>): ModuloDiferido<T> {
  let listo: T | null = null;
  let pendiente: Promise<T> | null = null;
  return {
    cargar: () =>
      (pendiente ??= importar().then(
        (m) => (listo = m),
        (error: unknown) => {
          pendiente = null; // un fallo de red no queda cacheado: se puede reintentar
          throw error;
        },
      )),
    listo: () => listo,
  };
}

/**
 * El módulo cuando `activo`; `null` mientras llega. `error` si no se pudo
 * descargar (p. ej. un despliegue nuevo cambió los archivos): `reintentar`
 * lo vuelve a pedir.
 */
export function useModuloDiferido<T>(modulo: ModuloDiferido<T>, activo: boolean) {
  const [estado, despachar] = useReducer(
    (e: { version: number; error: boolean }, accion: "listo" | "error" | "reintentar") => ({
      version: e.version + 1,
      error: accion === "error",
    }),
    { version: 0, error: false },
  );
  const listo = modulo.listo();

  useEffect(() => {
    if (!activo || listo || estado.error) return;
    let vigente = true;
    modulo.cargar().then(
      () => vigente && despachar("listo"),
      () => vigente && despachar("error"),
    );
    return () => {
      vigente = false;
    };
  }, [activo, listo, estado.error, modulo]);

  return {
    modulo: activo ? listo : null,
    error: activo && !listo && estado.error,
    reintentar: () => despachar("reintentar"),
  };
}
