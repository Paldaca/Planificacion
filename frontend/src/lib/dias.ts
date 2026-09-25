/**
 * Aritmética de días para las vistas de línea de tiempo (Gantt y Calendario).
 *
 * Todo en fechas LOCALES sin hora ("YYYY-MM-DD" ↔ Date a medianoche): así un
 * día nunca se corre por la zona horaria. Los días hábiles "de verdad" (con
 * feriados) los calcula el backend; aquí solo se dibujan.
 */

import { parsearDia } from "./fechas";

export const MS_DIA = 86_400_000;

export const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Lunes primero, como en el calendario venezolano de oficina. */
export const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export function aISO(fecha: Date): string {
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${m}-${d}`;
}

export function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

export function sumarDiasISO(iso: string, dias: number): string {
  return aISO(sumarDias(parsearDia(iso), dias));
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diferencia(desde: Date | string, hasta: Date | string): number {
  const a = typeof desde === "string" ? parsearDia(desde) : desde;
  const b = typeof hasta === "string" ? parsearDia(hasta) : hasta;
  return Math.round((b.getTime() - a.getTime()) / MS_DIA);
}

export function esFinDeSemana(fecha: Date): boolean {
  const d = fecha.getDay();
  return d === 0 || d === 6;
}

/** Lunes de la semana de `fecha`. */
export function inicioSemana(fecha: Date): Date {
  const dia = (fecha.getDay() + 6) % 7;
  return sumarDias(new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()), -dia);
}

export function inicioMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

export function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "septiembre 2026" */
export function nombreMes(fecha: Date): string {
  return `${MESES_LARGOS[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

/** Duración visible de una tarjeta: días de calendario, ambos extremos incluidos. */
export function diasIncluidos(inicio: string, fin: string): number {
  return diferencia(inicio, fin) + 1;
}
