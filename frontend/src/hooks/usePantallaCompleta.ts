import { useEffect, useState } from "react";

/**
 * Modo expandido de una vista (el Gantt): ocupa toda la ventana y, si el
 * navegador lo permite, pide además la pantalla completa real. Se pide para
 * todo el documento y no para la vista: diálogos, menús y globos van en
 * portales al final de `<body>` y quedarían ocultos fuera del elemento en
 * pantalla completa. Dentro del iframe del Portal depende de su
 * `allow="fullscreen"` (lo tiene); donde no se permita (iPhone, iframes sin
 * ese permiso) queda el modo expandido: toda el área de la página.
 *
 * Esc sale (salvo que haya un diálogo o panel abierto: ese se cierra antes).
 * Mientras dura, `<html data-pantalla-completa>` oculta la barra de la Suite
 * (`paldaca-nav`, con z-index ~1050: subir el de la vista taparía los diálogos).
 */
export function usePantallaCompleta() {
  const [expandido, setExpandido] = useState(false);

  useEffect(() => {
    if (!expandido) return;
    const raiz = document.documentElement;
    const overflowPrevio = raiz.style.overflow;
    raiz.style.overflow = "hidden";
    raiz.dataset.pantallaCompleta = "";
    // Salir de la pantalla completa del navegador (Esc, F11) cierra también el modo expandido.
    const alCambiar = () => {
      if (!document.fullscreenElement) setExpandido(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.fullscreenElement) return;
      if (document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
      setExpandido(false);
    };
    document.addEventListener("fullscreenchange", alCambiar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      raiz.style.overflow = overflowPrevio;
      delete raiz.dataset.pantallaCompleta;
      document.removeEventListener("fullscreenchange", alCambiar);
      document.removeEventListener("keydown", alTeclear);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [expandido]);

  function alternar() {
    if (expandido) {
      setExpandido(false);
      return;
    }
    setExpandido(true);
    // Tiene que pedirse dentro del clic (gesto del usuario).
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  return { expandido, alternar };
}
