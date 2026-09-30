/** Opciones de un campo de tipo lista: límites (los del backend) y cómo se leen de un texto. */

export const MAX_OPCIONES = 30;
export const MAX_LARGO_OPCION = 60;

/**
 * Texto escrito o pegado → opciones, sin repetir: una por línea (una columna
 * copiada de Excel) o separadas por comas o punto y coma.
 */
export function opcionesDeTexto(texto: string): string[] {
  const partes = texto.split(/[\n\r\t,;]+/).map((o) => o.trim().slice(0, MAX_LARGO_OPCION));
  return [...new Set(partes.filter(Boolean))];
}
