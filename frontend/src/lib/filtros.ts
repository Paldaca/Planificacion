import type { CardResumen, Urgencia } from "@/api/tipos";

export type EstadoFiltros = {
  texto: string;
  urgencias: Urgencia[];
  responsables: number[];
  soloVencidas: boolean;
};

export const FILTROS_VACIOS: EstadoFiltros = { texto: "", urgencias: [], responsables: [], soloVencidas: false };

export function hayFiltros(f: EstadoFiltros) {
  return Boolean(f.texto.trim() || f.urgencias.length || f.responsables.length || f.soloVencidas);
}

export function filtrar(cards: CardResumen[], f: EstadoFiltros): CardResumen[] {
  const texto = f.texto.trim().toLowerCase();
  return cards.filter((c) => {
    if (texto && !c.titulo.toLowerCase().includes(texto) && !`#${c.numero}`.includes(texto)) return false;
    if (f.urgencias.length && !f.urgencias.includes(c.urgencia)) return false;
    if (f.responsables.length && !c.responsables.some((p) => f.responsables.includes(p.id))) return false;
    if (f.soloVencidas && c.vencimiento !== "vencida" && c.vencimiento !== "vence_pronto") return false;
    return true;
  });
}
