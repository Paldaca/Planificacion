/**
 * Geometría del Gantt: rango visible, filas agrupadas y rutas de las flechas
 * de dependencias. Sin React: todo se puede razonar (y probar) aparte.
 */

import type { CardResumen, Columna, Dependencia, Persona } from "@/api/tipos";

import { aISO, diferencia, inicioSemana, sumarDias } from "./dias";
import { URGENCIAS, LISTA_URGENCIAS, colorAvatar } from "./estilos";
import { parsearDia } from "./fechas";

export type Zoom = "dia" | "semana" | "mes";
export type Agrupacion = "columna" | "responsable" | "urgencia" | "ninguna";

export const PX_POR_DIA: Record<Zoom, number> = { dia: 36, semana: 16, mes: 5 };
const DIAS_MINIMOS: Record<Zoom, number> = { dia: 42, semana: 119, mes: 365 };

export const ALTO_FILA = 40;
export const ALTO_GRUPO = 32;
export const ALTO_BARRA = 24;

export type Rango = { desde: Date; hasta: Date; dias: number };

/**
 * Del lunes anterior a la primera tarjeta (o a hoy) hasta unas semanas después
 * de la última. `diasVisibles`: los que caben en el ancho disponible; el rango
 * se alarga hasta cubrirlos para que la línea de tiempo nunca quede corta.
 */
export function calcularRango(cards: CardResumen[], zoom: Zoom, hoy: Date, diasVisibles = 0): Rango {
  let min = hoy;
  let max = hoy;
  for (const c of cards) {
    if (c.fecha_inicio && parsearDia(c.fecha_inicio) < min) min = parsearDia(c.fecha_inicio);
    if (c.fecha_fin && parsearDia(c.fecha_fin) > max) max = parsearDia(c.fecha_fin);
  }
  const desde = inicioSemana(sumarDias(min, -7));
  let hasta = sumarDias(max, 21);
  const minimo = Math.max(DIAS_MINIMOS[zoom], diasVisibles - 1);
  if (diferencia(desde, hasta) < minimo) hasta = sumarDias(desde, minimo);
  return { desde, hasta, dias: diferencia(desde, hasta) + 1 };
}

// --- Filas ------------------------------------------------------------------------------

/** Avance de un grupo: lo que ve el jefe de un vistazo (y la barra resumen). */
export type Avance = { total: number; hechas: number; vencidas: number; desde: string | null; hasta: string | null };

export type Fila =
  | ({ tipo: "grupo"; clave: string; titulo: string; color: string; y: number } & Avance)
  | { tipo: "card"; card: CardResumen; y: number };

/** Terminadas, vencidas y tramo (primer inicio – último fin) de unas tarjetas. */
export function avanceDe(cards: CardResumen[]): Avance {
  let desde: string | null = null;
  let hasta: string | null = null;
  let hechas = 0;
  let vencidas = 0;
  for (const c of cards) {
    if (c.vencimiento === "terminada") hechas += 1;
    else if (c.vencimiento === "vencida") vencidas += 1;
    if (c.fecha_inicio && (desde === null || c.fecha_inicio < desde)) desde = c.fecha_inicio;
    if (c.fecha_fin && (hasta === null || c.fecha_fin > hasta)) hasta = c.fecha_fin;
  }
  return { total: cards.length, hechas, vencidas, desde, hasta };
}

function grupoDe(card: CardResumen, agrupar: Agrupacion, columnas: Map<number, Columna>) {
  switch (agrupar) {
    case "columna": {
      const col = columnas.get(card.columna);
      return { clave: `c${card.columna}`, titulo: col?.nombre ?? "—", color: col?.es_final ? "#059669" : "#32407b", orden: col?.orden ?? 0 };
    }
    case "responsable": {
      const p: Persona | undefined = card.responsables[0];
      return p
        ? { clave: `p${p.id}`, titulo: p.nombre, color: colorAvatar(p.id), orden: 0 }
        : { clave: "p0", titulo: "Sin responsable", color: "#94a3b8", orden: 1 };
    }
    case "urgencia": {
      const u = URGENCIAS[card.urgencia];
      return { clave: card.urgencia, titulo: u.etiqueta, color: u.color, orden: -LISTA_URGENCIAS.indexOf(card.urgencia) };
    }
    case "ninguna":
      return null;
  }
}

const porInicio = (a: CardResumen, b: CardResumen) =>
  (a.fecha_inicio ?? "").localeCompare(b.fecha_inicio ?? "") || a.numero - b.numero;

/** Filas con su `y`; los grupos plegados muestran solo su cabecera. */
export function construirFilas(
  cards: CardResumen[],
  agrupar: Agrupacion,
  columnas: Columna[],
  plegados: Set<string>,
): { filas: Fila[]; alto: number } {
  const mapa = new Map(columnas.map((c) => [c.id, c]));
  const filas: Fila[] = [];
  let y = 0;
  if (agrupar === "ninguna") {
    for (const card of [...cards].sort(porInicio)) {
      filas.push({ tipo: "card", card, y });
      y += ALTO_FILA;
    }
    return { filas, alto: y };
  }
  const grupos = new Map<string, { titulo: string; color: string; orden: number; cards: CardResumen[] }>();
  for (const card of cards) {
    const g = grupoDe(card, agrupar, mapa)!;
    if (!grupos.has(g.clave)) grupos.set(g.clave, { ...g, cards: [] });
    grupos.get(g.clave)!.cards.push(card);
  }
  const ordenados = [...grupos.entries()].sort(
    ([, a], [, b]) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"),
  );
  for (const [clave, g] of ordenados) {
    filas.push({ tipo: "grupo", clave, titulo: g.titulo, color: g.color, ...avanceDe(g.cards), y });
    y += ALTO_GRUPO;
    if (plegados.has(clave)) continue;
    for (const card of g.cards.sort(porInicio)) {
      filas.push({ tipo: "card", card, y });
      y += ALTO_FILA;
    }
  }
  return { filas, alto: y };
}

// --- Posiciones ---------------------------------------------------------------------------

export function xDeFecha(iso: string, rango: Rango, px: number): number {
  return diferencia(rango.desde, iso) * px;
}

/** Día (ISO) bajo una coordenada x del área de tiempo. */
export function fechaDeX(x: number, rango: Rango, px: number): string {
  return aISO(sumarDias(rango.desde, Math.floor(x / px)));
}

export type Caja = { x1: number; x2: number; y: number };

/** Borde izquierdo/derecho y centro vertical de cada barra visible. */
export function cajas(filas: Fila[], rango: Rango, px: number): Map<number, Caja> {
  const res = new Map<number, Caja>();
  for (const f of filas) {
    if (f.tipo !== "card" || !f.card.fecha_inicio || !f.card.fecha_fin) continue;
    const x1 = xDeFecha(f.card.fecha_inicio, rango, px);
    const x2 = xDeFecha(f.card.fecha_fin, rango, px) + px;
    res.set(f.card.id, { x1, x2, y: f.y + ALTO_FILA / 2 });
  }
  return res;
}

/**
 * Ruta ortogonal de una flecha. Sale del borde que dicta el tipo (fin o
 * inicio de la predecesora) y entra por el borde que restringe la sucesora.
 * Si no hay espacio hacia adelante, rodea por el hueco entre filas.
 */
export function rutaFlecha(dep: Dependencia, pred: Caja, suc: Caja): string {
  const G = 10;
  const sale = dep.tipo === "inicio_inicio" ? pred.x1 : pred.x2;
  const entraPorFin = dep.tipo === "fin_fin";
  const llega = entraPorFin ? suc.x2 : suc.x1;
  const y1 = pred.y;
  const y2 = suc.y;

  if (entraPorFin) {
    const xm = Math.max(sale, llega) + G;
    return `M ${sale} ${y1} H ${xm} V ${y2} H ${llega + 2}`;
  }
  const salida = dep.tipo === "inicio_inicio" ? sale - G : sale + G;
  if (llega - G >= salida || dep.tipo === "inicio_inicio") {
    const xm = dep.tipo === "inicio_inicio" ? Math.min(salida, llega - G) : Math.max(salida, llega - G);
    return `M ${sale} ${y1} H ${xm} V ${y2} H ${llega - 2}`;
  }
  const yHueco = y1 + (y2 > y1 ? ALTO_FILA / 2 : -ALTO_FILA / 2);
  return `M ${sale} ${y1} H ${salida} V ${yHueco} H ${llega - G} V ${y2} H ${llega - 2}`;
}

export const ETIQUETAS_TIPO: Record<Dependencia["tipo"], { corta: string; larga: string }> = {
  fin_inicio: { corta: "FC", larga: "Empieza cuando la otra termina" },
  inicio_inicio: { corta: "CC", larga: "Empieza cuando la otra empieza" },
  fin_fin: { corta: "FF", larga: "Termina cuando la otra termina" },
};
