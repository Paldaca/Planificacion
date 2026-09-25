import type { Vencimiento } from "@/api/tipos";
import { hoy, parsearDia } from "./fechas";

/** Días hábiles (lun-vie) después de `desde` hasta `hasta` inclusive. */
function diasHabilesHasta(desde: Date, hasta: Date): number {
  let dias = 0;
  const actual = new Date(desde);
  while (actual < hasta) {
    actual.setDate(actual.getDate() + 1);
    const dia = actual.getDay();
    if (dia !== 0 && dia !== 6) dias += 1;
  }
  return dias;
}

/**
 * Espejo (sin feriados) de `tableros.services.vencimientos.vencimiento` para las actualizaciones
 * optimistas (mover una card, cambiar su fecha): el servidor sigue siendo la
 * fuente de verdad y su respuesta reemplaza este cálculo en cuanto llega.
 */
export function calcularVencimiento(fechaFin: string | null, terminada: boolean): Vencimiento {
  if (terminada) return "terminada";
  if (!fechaFin) return "sin_fecha";
  const fin = parsearDia(fechaFin);
  const d = hoy();
  if (fin < d) return "vencida";
  if (diasHabilesHasta(d, fin) <= 2) return "vence_pronto";
  return "al_dia";
}
