/** Fechas de la API: "YYYY-MM-DD" (sin hora) o ISO con hora. */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09-24" -> Date local (sin corrimiento por zona horaria). */
export function parsearDia(valor: string): Date {
  const [a, m, d] = valor.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function hoy(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

export function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 86_400_000);
}

/** "24 sep" (o "24 sep 2027" si no es este año). */
export function diaCorto(valor: string | null): string {
  if (!valor) return "";
  const f = parsearDia(valor);
  const base = `${f.getDate()} ${MESES[f.getMonth()]}`;
  return f.getFullYear() === new Date().getFullYear() ? base : `${base} ${f.getFullYear()}`;
}

/** Rango compacto para una tarjeta: "3 – 12 oct", "12 oct", "desde 3 oct". */
export function rangoCorto(inicio: string | null, fin: string | null): string {
  if (inicio && fin) {
    const a = parsearDia(inicio);
    const b = parsearDia(fin);
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return a.getDate() === b.getDate() ? diaCorto(fin) : `${a.getDate()} – ${diaCorto(fin)}`;
    }
    return `${diaCorto(inicio)} – ${diaCorto(fin)}`;
  }
  if (fin) return diaCorto(fin);
  if (inicio) return `desde ${diaCorto(inicio)}`;
  return "";
}

/** "vence hoy", "venció hace 3 días", "en 5 días". */
export function relativoFin(fin: string): string {
  const d = diasEntre(hoy(), parsearDia(fin));
  if (d === 0) return "vence hoy";
  if (d === 1) return "vence mañana";
  if (d === -1) return "venció ayer";
  if (d < 0) return `venció hace ${-d} días`;
  return `en ${d} días`;
}

/** "hace 5 min", "hace 2 h", "ayer", "3 sep". */
export function haceCuanto(iso: string): string {
  const fecha = new Date(iso);
  const segundos = Math.round((Date.now() - fecha.getTime()) / 1000);
  if (segundos < 45) return "justo ahora";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return `${fecha.getDate()} ${MESES[fecha.getMonth()]}`;
}

export function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** "Jueves, 24 de septiembre" (solo la primera letra en mayúscula). */
export function fechaLarga(): string {
  const texto = new Date().toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
