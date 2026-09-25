/**
 * Refresco automático respetuoso con la sesión del Portal (R-07,
 * docs/plan-modulo-planificacion.md §6.5): solo mientras la pestaña está
 * visible Y hubo actividad real del usuario en los últimos 10 minutos. Sin
 * esto, un tablero abierto en una pestaña olvidada consultaría la API para
 * siempre y mantendría viva la sesión del Portal sin nadie delante.
 */

const INACTIVIDAD_MAXIMA_MS = 10 * 60 * 1000;
let ultimaActividad = Date.now();

if (typeof window !== "undefined") {
  const marcar = () => {
    ultimaActividad = Date.now();
  };
  for (const evento of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "focus"]) {
    window.addEventListener(evento, marcar, { passive: true });
  }
}

export function usuarioActivo(): boolean {
  return (
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    Date.now() - ultimaActividad < INACTIVIDAD_MAXIMA_MS
  );
}

/** `refetchInterval` para TanStack Query: cada `ms` solo con el usuario presente. */
export function refrescoVivo(ms: number) {
  return () => (usuarioActivo() ? ms : false);
}
