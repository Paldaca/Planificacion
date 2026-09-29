/**
 * Tableros favoritos: cada persona marca los que usa más (solo los ve ella).
 * Separado de `queries.ts` (auditoría A-11). Optimista: la estrella cambia al
 * instante en el listado, en el tablero abierto y en los tableros del equipo;
 * si el servidor falla, se vuelve a pedir lo cambiado.
 */

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { avisarError, claves } from "./queries";
import type { TableroDetalle, TableroResumen } from "./tipos";

const V1 = "/api/v1";

function reflejar(qc: QueryClient, tablero: TableroResumen, esFavorito: boolean) {
  const marcar = <T extends TableroResumen>(t: T): T => (t.id === tablero.id ? { ...t, es_favorito: esFavorito } : t);
  qc.setQueryData<TableroResumen[]>(claves.tableros, (lista) => lista?.map(marcar));
  qc.setQueryData<TableroDetalle>(claves.tablero(tablero.id), (t) => (t ? marcar(t) : t));
  if (tablero.equipo) {
    qc.setQueryData<TableroResumen[]>(claves.tablerosEquipo(tablero.equipo.id), (lista) => lista?.map(marcar));
  }
}

export function useFavorito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tablero, favorito }: { tablero: TableroResumen; favorito: boolean }) =>
      favorito
        ? api.post<{ es_favorito: boolean }>(`${V1}/tableros/${tablero.id}/favorito/`)
        : api.del<{ es_favorito: boolean }>(`${V1}/tableros/${tablero.id}/favorito/`),
    onMutate: ({ tablero, favorito }) => reflejar(qc, tablero, favorito),
    onError: (error, { tablero }) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tableros });
      qc.invalidateQueries({ queryKey: claves.tablero(tablero.id) });
      if (tablero.equipo) qc.invalidateQueries({ queryKey: claves.tablerosEquipo(tablero.equipo.id) });
    },
  });
}
