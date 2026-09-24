/**
 * Contrato `paldaca-embed` v1 — lado emisor (satélite -> shell del Portal).
 *
 * Mismo shape que `Portal-Paldaca/frontend/src/components/module-frame/protocol.ts`
 * (el parser del lado del shell) — si se cambia algo aquí, hay que
 * actualizar ese archivo también: es un contrato Suite-wide.
 *
 * Planificación es un satélite React (como Facturación). Los satélites Django
 * emiten esto desde `paldaca_embed.html` (un script que reacciona a cada
 * carga de documento); acá lo emite este módulo, atado al router de React,
 * porque una SPA no vuelve a cargar un documento en cada navegación interna.
 */

export const EMBED_PROTOCOL_VERSION = 1;
export const EMBED_SOURCE = "paldaca-embed";

export type EmbedMessageType =
  | "ready"
  | "navigate"
  | "loading"
  | "session-expired"
  | "forbidden";

type EmbedMessageBase = {
  v: typeof EMBED_PROTOCOL_VERSION;
  source: typeof EMBED_SOURCE;
  app: string;
};

export type EmbedMessage =
  | (EmbedMessageBase & { type: "ready"; path: string; title?: string })
  | (EmbedMessageBase & { type: "navigate"; path: string; title?: string })
  | (EmbedMessageBase & { type: "loading" })
  | (EmbedMessageBase & { type: "session-expired" })
  | (EmbedMessageBase & { type: "forbidden" });

/** ¿Este documento se está mostrando dentro de un iframe? */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Acceso a window.top bloqueado por política de origen cruzado — solo
    // ocurre si YA estamos dentro de un frame de otro origen.
    return true;
  }
}

// `Omit` sobre una unión discriminada colapsa los miembros a sus campos
// comunes (no distribuye por default) — con eso `postEmbedMessage({ type:
// "ready", path: ... })` perdería `path`. Esta variante sí distribuye.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/**
 * Emite un mensaje del protocolo hacia `window.parent`, si estamos embebidos.
 * No lanza si no hay padre alcanzable (misma razón que la referencia Django:
 * evita que un satélite abierto suelto o mal configurado rompa la app).
 */
export function postEmbedMessage(
  message: DistributiveOmit<EmbedMessage, "v" | "source" | "app">,
  targetOrigin: string,
  appCode: string,
): void {
  if (!isEmbedded() || !targetOrigin) return;
  const full: EmbedMessage = {
    v: EMBED_PROTOCOL_VERSION,
    source: EMBED_SOURCE,
    app: appCode,
    ...message,
  } as EmbedMessage;
  try {
    window.parent.postMessage(full, targetOrigin);
  } catch {
    /* sin padre alcanzable: no hay nada que avisar */
  }
}
