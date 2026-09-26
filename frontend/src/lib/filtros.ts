import type { CardResumen, Urgencia } from "@/api/tipos";

export type EstadoFiltros = {
  texto: string;
  urgencias: Urgencia[];
  responsables: number[];
  /** Ids de etiquetas (fase 5): basta con que la tarjeta tenga una. */
  etiquetas: number[];
  soloVencidas: boolean;
};

/**
 * Espejo de `backend/exportacion/services/datos.py::Filtros` («exportar lo
 * que se ve»): si cambias uno, cambia el otro.
 */
export const FILTROS_VACIOS: EstadoFiltros = { texto: "", urgencias: [], responsables: [], etiquetas: [], soloVencidas: false };

export function hayFiltros(f: EstadoFiltros) {
  return Boolean(f.texto.trim() || f.urgencias.length || f.responsables.length || f.etiquetas.length || f.soloVencidas);
}

export function filtrar(cards: CardResumen[], f: EstadoFiltros): CardResumen[] {
  const texto = f.texto.trim().toLowerCase();
  return cards.filter((c) => {
    if (texto && !c.titulo.toLowerCase().includes(texto) && !`#${c.numero}`.includes(texto)) return false;
    if (f.urgencias.length && !f.urgencias.includes(c.urgencia)) return false;
    if (f.responsables.length && !c.responsables.some((p) => f.responsables.includes(p.id))) return false;
    if (f.etiquetas.length && !c.etiquetas.some((e) => f.etiquetas.includes(e))) return false;
    if (f.soloVencidas && c.vencimiento !== "vencida" && c.vencimiento !== "vence_pronto") return false;
    return true;
  });
}
