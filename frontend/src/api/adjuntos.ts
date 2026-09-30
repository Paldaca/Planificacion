/**
 * Adjuntos de una tarjeta: archivos que acompañan a la descripción. Vienen
 * dentro del detalle de la tarjeta (`CardDetalle.adjuntos`); aquí se suben, se
 * quitan y se descargan, y se mantiene esa caché al día.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, descargar } from "./client";
import { avisarError, claves } from "./queries";
import type { Adjunto, CardDetalle } from "./tipos";

const V1 = "/api/v1";

/** Espejo de `tableros/services/adjuntos.py::MAX_BYTES`, para avisar antes de subir; manda el servidor. */
export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024;

type Tarjeta = { id: number; numero: number };

export function useSubirAdjunto(tableroId: number, card: Tarjeta) {
  const qc = useQueryClient();
  return useMutation({
    // En serie: varios archivos elegidos a la vez suben uno tras otro.
    scope: { id: `adjuntos-${card.id}` },
    mutationFn: (archivo: File) => {
      const datos = new FormData();
      datos.append("archivo", archivo);
      return api.subir<Adjunto>(`${V1}/cards/${card.id}/adjuntos/`, datos);
    },
    onSuccess: (adjunto) => {
      qc.setQueryData<CardDetalle>(claves.card(tableroId, card.numero), (c) =>
        c ? { ...c, adjuntos: [...c.adjuntos, adjunto] } : c,
      );
      qc.invalidateQueries({ queryKey: claves.actividad(card.id) });
    },
    onError: avisarError,
  });
}

export function useQuitarAdjunto(tableroId: number, card: Tarjeta) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`${V1}/adjuntos/${id}/`),
    onSuccess: (_, id) => {
      qc.setQueryData<CardDetalle>(claves.card(tableroId, card.numero), (c) =>
        c ? { ...c, adjuntos: c.adjuntos.filter((a) => a.id !== id) } : c,
      );
      qc.invalidateQueries({ queryKey: claves.actividad(card.id) });
    },
    onError: avisarError,
  });
}

export function useDescargarAdjunto() {
  return useMutation({
    mutationFn: (adjunto: Adjunto) => descargar(`${V1}/adjuntos/${adjunto.id}/`, adjunto.nombre),
    onError: avisarError,
  });
}
