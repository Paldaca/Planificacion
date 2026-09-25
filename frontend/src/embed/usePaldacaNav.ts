import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Barra de navegación unificada de la Suite (`paldaca-nav`, la publica el
 * Portal) para cuando Planificación se abre SUELTA en su subdominio. Embebida
 * en el Portal no hace falta: el shell ya la muestra.
 *
 * - El menú (ítems, icono del módulo, campana de avisos, perfil) lo define el
 *   Portal en `navigationConfig.ts`: aquí no se repite nada.
 * - Los enlaces a rutas de esta SPA se resuelven con React Router (sin
 *   recargar) y el widget se entera de cada cambio de ruta para marcar el
 *   ítem activo (evento `paldaca-nav:ubicacion`, docs/paldaca-nav-embed.md).
 * - Si el Portal no responde, `estado` pasa a "fallo" y el Shell pinta su
 *   menú de respaldo: la app nunca queda sin navegación.
 */

const PORTAL_URL = import.meta.env.VITE_PALDACA_PORTAL_URL.replace(/\/+$/, "");
const NAV_ASSETS = (import.meta.env.VITE_PALDACA_NAV_URL || `${PORTAL_URL}/static`).replace(/\/+$/, "");
const PORTAL_API = import.meta.env.VITE_PALDACA_PORTAL_API_URL;

const ID_SCRIPT = "paldaca-nav-script";
const ID_CSS = "paldaca-nav-css";
const EVENTO_UBICACION = "paldaca-nav:ubicacion";
const LIMITE_MS = 8000;

/** Rutas de esta SPA: un enlace del menú a ellas no recarga la página. */
const RUTAS_PROPIAS = ["/mis-tareas", "/tableros", "/equipos", "/invitaciones"];

export type EstadoNav = "cargando" | "montado" | "fallo";

function esRutaPropia(url: URL): boolean {
  // En desarrollo el bundle del menú trae las URL de producción
  // (planificacion.cpaldaca.com): se tratan como propias por su ruta.
  const propio = url.origin === window.location.origin || url.hostname.startsWith("planificacion.");
  const ruta = url.pathname.replace(/\/+$/, "") || "/";
  return propio && (ruta === "/" || RUTAS_PROPIAS.some((r) => ruta === r || ruta.startsWith(`${r}/`)));
}

export function usePaldacaNav(activo: boolean): EstadoNav {
  const [estado, setEstado] = useState<EstadoNav>(() =>
    document.body.classList.contains("paldaca-nav-mounted") ? "montado" : "cargando",
  );
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!activo) return;
    window.__PALDACA_NAV__ = {
      root: "#paldaca-nav-root",
      portalUrl: PORTAL_URL,
      currentApp: "planificacion",
      logoFullUrl: `${PORTAL_URL}/images/logo%20blanco.png`,
      logoCompactUrl: `${PORTAL_URL}/images/logo%20blanco%20recortado.png`,
      ...(PORTAL_API ? { apiBaseUrl: PORTAL_API } : {}),
    };

    const observador = new MutationObserver(() => {
      // Una vez en el respaldo no se vuelve atrás: el contenedor ya no existe.
      if (document.body.classList.contains("paldaca-nav-mounted")) setEstado((e) => (e === "fallo" ? e : "montado"));
    });
    observador.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    const aRespaldo = () => {
      // Si el script llega tarde, sin configuración no intenta montarse en un
      // contenedor que ya no está (dejaría un error en la consola).
      delete window.__PALDACA_NAV__;
      setEstado((e) => (e === "montado" ? e : "fallo"));
    };
    const limite = window.setTimeout(() => {
      if (!document.body.classList.contains("paldaca-nav-mounted")) aRespaldo();
    }, LIMITE_MS);

    if (!document.getElementById(ID_CSS)) {
      const css = document.createElement("link");
      css.id = ID_CSS;
      css.rel = "stylesheet";
      css.href = `${NAV_ASSETS}/paldaca-nav.css`;
      document.head.appendChild(css);
    }
    if (window.PaldacaNav) {
      window.PaldacaNav.init();
    } else if (!document.getElementById(ID_SCRIPT)) {
      const script = document.createElement("script");
      script.id = ID_SCRIPT;
      script.src = `${NAV_ASSETS}/paldaca-nav.js`;
      script.defer = true;
      script.onerror = aRespaldo;
      document.body.appendChild(script);
    }

    return () => {
      observador.disconnect();
      window.clearTimeout(limite);
    };
  }, [activo]);

  // Enlaces del menú a esta SPA: navegación interna, sin recargar.
  useEffect(() => {
    if (!activo) return;
    const alHacerClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as Element | null)?.closest?.("#paldaca-nav-root a[href]");
      if (!(enlace instanceof HTMLAnchorElement) || enlace.target === "_blank") return;
      const url = new URL(enlace.href, window.location.href);
      if (!esRutaPropia(url)) return;
      e.preventDefault();
      navigate(`${url.pathname}${url.search}`);
    };
    // Captura: antes que React cierre el cajón del menú (que sigue cerrándose).
    document.addEventListener("click", alHacerClic, true);
    return () => document.removeEventListener("click", alHacerClic, true);
  }, [activo, navigate]);

  // El widget marca el ítem activo según la URL.
  useEffect(() => {
    if (activo) window.dispatchEvent(new Event(EVENTO_UBICACION));
  }, [activo, location.pathname]);

  return estado;
}

declare global {
  interface Window {
    PaldacaNav?: { init: (opciones?: Record<string, unknown>) => void; destroy: () => void };
    __PALDACA_NAV__?: Record<string, unknown>;
  }
}
