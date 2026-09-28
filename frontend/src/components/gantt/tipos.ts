/** Tipos y medidas que comparten las piezas de la vista Gantt. */

import type { CardResumen } from "@/api/tipos";

/** Alto de la escala de fechas (meses + días). */
export const ALTO_ESCALA = 52;

export type Modo = "mover" | "inicio" | "fin";
export type Enlace = { desde: number; x: number; y: number };
export type Colocando = { card: CardResumen; x: number; y: number; movido: boolean; x0: number; y0: number };
