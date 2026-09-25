import type { Urgencia, Vencimiento } from "@/api/tipos";

/**
 * Colores de dominio. La urgencia usa una escala propia (no la familia navy
 * de marca, que es casi indistinguible entre sí); el rojo de marca queda para
 * lo crítico, igual que en el Portal queda para lo destructivo.
 */
export const URGENCIAS: Record<Urgencia, { etiqueta: string; color: string; orden: number }> = {
  baja: { etiqueta: "Baja", color: "#64748b", orden: 0 },
  media: { etiqueta: "Media", color: "#2563eb", orden: 1 },
  alta: { etiqueta: "Alta", color: "#d97706", orden: 2 },
  critica: { etiqueta: "Crítica", color: "#ed2546", orden: 3 },
};

export const LISTA_URGENCIAS: Urgencia[] = ["baja", "media", "alta", "critica"];

export const VENCIMIENTOS: Record<Vencimiento, { etiqueta: string; color: string } | null> = {
  vencida: { etiqueta: "Vencida", color: "#dc2626" },
  vence_pronto: { etiqueta: "Vence pronto", color: "#d97706" },
  al_dia: { etiqueta: "Al día", color: "#5a6294" },
  terminada: { etiqueta: "Terminada", color: "#059669" },
  sin_fecha: null,
};

/** Colores de equipo (misma paleta que los acentos de módulo del Portal). */
export const COLORES_EQUIPO = [
  "#32407b",
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#d97706",
  "#be123c",
  "#0f766e",
  "#4f46e5",
];

const COLORES_AVATAR = ["#32407b", "#2563eb", "#0d9488", "#7c3aed", "#b45309", "#be123c", "#0369a1", "#4f46e5"];

export function colorAvatar(id: number): string {
  return COLORES_AVATAR[Math.abs(id) % COLORES_AVATAR.length];
}

/** Fondo suave derivado de un color (equivalente a color-mix del Portal). */
export function tinte(color: string, porcentaje = 10): string {
  return `color-mix(in srgb, ${color} ${porcentaje}%, #fff)`;
}

export const ROLES: Record<string, string> = {
  administrador: "Administrador",
  miembro: "Miembro",
  lector: "Lector",
  propietario: "Propietario",
};
