/**
 * Tarjetas recurrentes: la serie se arma desde una tarjeta y crea una nueva
 * cada semana o cada mes (la crea el servidor con su comando diario). Mismo
 * patrón que `configuracion.ts`; la lista cuelga de la clave del tablero, así
 * que invalidar el tablero también la refresca.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { avisarError, claves } from "./queries";
import type { Frecuencia, Recurrencia } from "./tipos";

const V1 = "/api/v1";

const clave = (tableroId: number) => [...claves.tablero(tableroId), "recurrencias"] as const;

export type DatosRecurrencia = { frecuencia: Frecuencia; intervalo: number; dia: number; anticipacion: number };

export const useRecurrencias = (tableroId: number, habilitado = true) =>
  useQuery({
    queryKey: clave(tableroId),
    queryFn: () => api.get<Recurrencia[]>(`${V1}/tableros/${tableroId}/recurrencias/`),
    enabled: habilitado,
  });

function useRefrescar(tableroId: number) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    qc.invalidateQueries({ queryKey: ["card", tableroId] });
  };
}

/** La tarjeta empieza a repetirse (pasa a ser la primera de la serie). */
export function useRepetirCard(tableroId: number) {
  const refrescar = useRefrescar(tableroId);
  return useMutation({
    mutationFn: ({ cardId, datos }: { cardId: number; datos: DatosRecurrencia }) =>
      api.post<Recurrencia>(`${V1}/cards/${cardId}/recurrencia/`, datos),
    onSuccess: refrescar,
    onError: avisarError,
  });
}

export function useEditarRecurrencia(tableroId: number) {
  const refrescar = useRefrescar(tableroId);
  return useMutation({
    mutationFn: ({
      id,
      cambios,
    }: {
      id: number;
      cambios: Partial<DatosRecurrencia> & { activa?: boolean; modelo_desde?: number };
    }) => api.patch<Recurrencia>(`${V1}/recurrencias/${id}/`, cambios),
    onSuccess: refrescar,
    onError: avisarError,
  });
}

export function useQuitarRecurrencia(tableroId: number) {
  const refrescar = useRefrescar(tableroId);
  return useMutation({
    mutationFn: (id: number) => api.del(`${V1}/recurrencias/${id}/`),
    onSuccess: refrescar,
    onError: avisarError,
  });
}
