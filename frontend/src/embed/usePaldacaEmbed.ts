import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { isEmbedded, postEmbedMessage } from "./protocol";

const PORTAL_ORIGIN = import.meta.env.VITE_PALDACA_PORTAL_URL as string;
const APP_CODE = "planificacion";

/**
 * Mantiene sincronizado el shell del Portal con la navegación de esta SPA.
 *
 * A diferencia de un satélite Django (donde cada clic es una carga de
 * documento nueva y el par `loading`→`ready` viene gratis del ciclo
 * request/response), acá no hay una carga de red por cada ruta: React
 * Router resuelve la navegación en el cliente. Mientras no existan páginas
 * con carga de datos propia, cada cambio de ruta se considera "listo" de
 * inmediato (`ready`). El día que una página de negocio necesite mostrar el
 * overlay del shell mientras trae datos, debe llamar `notifyLoading()` al
 * empezar y dejar que el `ready` automático de la siguiente ruta lo cierre
 * — o llamar `notifyReady()` a mano si termina sin cambiar de ruta.
 */
export function usePaldacaEmbed() {
  const location = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // La primera carga NO emite acá: `App` llama `notifyReady()` a mano una
    // vez que `useIdentity` resuelve, para que el overlay del shell no se
    // oculte mientras todavía estamos esperando saber si hay sesión.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const path = `${location.pathname}${location.search}`;
    const title = document.title || undefined;
    postEmbedMessage({ type: "navigate", path, title }, PORTAL_ORIGIN, APP_CODE);
    // Sin fetch de datos propio todavía: la ruta ya está pintada para cuando
    // corre este efecto, así que el "ready" sigue inmediatamente al
    // "navigate" (a diferencia de Django, no hay una segunda carga que
    // esperar). Ver docstring de arriba.
    postEmbedMessage({ type: "ready", path, title }, PORTAL_ORIGIN, APP_CODE);
  }, [location.pathname, location.search]);

  const notifyLoading = useCallback(() => {
    postEmbedMessage({ type: "loading" }, PORTAL_ORIGIN, APP_CODE);
  }, []);

  const notifyReady = useCallback(() => {
    const path = `${location.pathname}${location.search}`;
    postEmbedMessage({ type: "ready", path, title: document.title || undefined }, PORTAL_ORIGIN, APP_CODE);
  }, [location.pathname, location.search]);

  const notifySessionExpired = useCallback(() => {
    postEmbedMessage({ type: "session-expired" }, PORTAL_ORIGIN, APP_CODE);
  }, []);

  const notifyForbidden = useCallback(() => {
    postEmbedMessage({ type: "forbidden" }, PORTAL_ORIGIN, APP_CODE);
  }, []);

  return {
    embedded: isEmbedded(),
    notifyLoading,
    notifyReady,
    notifySessionExpired,
    notifyForbidden,
  };
}
