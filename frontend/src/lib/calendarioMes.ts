/**
 * Distribución de tarjetas en la cuadrícula mensual: cada semana es una fila
 * y cada tarjeta un segmento de columnas (lun..dom) dentro de un carril.
 */

import type { CardResumen } from "@/api/tipos";

import { aISO, diferencia, inicioMes, inicioSemana, sumarDias } from "./dias";

export const CARRILES_VISIBLES = 3;

export type Segmento = {
  card: CardResumen;
  /** Columna 0..6 donde empieza en esta semana y cuántas ocupa. */
  desde: number;
  largo: number;
  carril: number;
  /** Viene de la semana anterior / sigue en la siguiente (esquinas rectas). */
  sigueAntes: boolean;
  sigueDespues: boolean;
};

export type Semana = {
  dias: Date[];
  segmentos: Segmento[];
  /** Tarjetas que no caben en los carriles visibles, por columna. */
  ocultas: number[];
};

/** Días que ocupa una tarjeta; si solo tiene una fecha, ese día. */
export function rangoDe(card: CardResumen): [string, string] | null {
  const inicio = card.fecha_inicio ?? card.fecha_fin;
  const fin = card.fecha_fin ?? card.fecha_inicio;
  return inicio && fin ? [inicio, fin] : null;
}

/** Las 6 semanas (lunes a domingo) que cubren el mes de `mes`. */
export function semanasDelMes(mes: Date): Date[][] {
  const primero = inicioSemana(inicioMes(mes));
  return Array.from({ length: 6 }, (_, s) => Array.from({ length: 7 }, (_, d) => sumarDias(primero, s * 7 + d)));
}

export function distribuir(mes: Date, cards: CardResumen[]): Semana[] {
  const conRango = cards
    .map((card) => ({ card, rango: rangoDe(card) }))
    .filter((x): x is { card: CardResumen; rango: [string, string] } => x.rango !== null);

  return semanasDelMes(mes).map((dias) => {
    const lunes = aISO(dias[0]);
    const domingo = aISO(dias[6]);
    const tramos = conRango
      .filter(({ rango: [ini, fin] }) => ini <= domingo && fin >= lunes)
      .map(({ card, rango: [ini, fin] }) => {
        const desde = Math.max(0, diferencia(lunes, ini));
        const hasta = Math.min(6, diferencia(lunes, fin));
        return { card, desde, largo: hasta - desde + 1, sigueAntes: ini < lunes, sigueDespues: fin > domingo };
      })
      // Primero las que empiezan antes; a igual inicio, las más largas arriba.
      .sort((a, b) => a.desde - b.desde || b.largo - a.largo || a.card.id - b.card.id);

    const ocupado: boolean[][] = [];
    const segmentos: Segmento[] = [];
    const ocultas = Array(7).fill(0);
    for (const t of tramos) {
      let carril = 0;
      while (ocupado[carril]?.slice(t.desde, t.desde + t.largo).some(Boolean)) carril += 1;
      ocupado[carril] ??= Array(7).fill(false);
      for (let c = t.desde; c < t.desde + t.largo; c += 1) ocupado[carril][c] = true;
      if (carril < CARRILES_VISIBLES) segmentos.push({ ...t, carril });
      else for (let c = t.desde; c < t.desde + t.largo; c += 1) ocultas[c] += 1;
    }
    return { dias, segmentos, ocultas };
  });
}
