/**
 * Adjuntos de una tarjeta: imágenes y archivos que acompañan a la descripción. Vienen
 * dentro del detalle de la tarjeta (`CardDetalle.adjuntos`); aquí se suben, se
 * quitan y se descargan, y se mantiene esa caché al día.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, descargar, urlApi } from "./client";
import { avisarError, claves, editarTablero } from "./queries";
import type { QueryClient } from "@tanstack/react-query";
import type { Adjunto, CardDetalle } from "./tipos";

const V1 = "/api/v1";

/** Espejo de `tableros/services/adjuntos.py::MAX_BYTES`, para avisar antes de subir; manda el servidor. */
export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024;

/**
 * Dirección de una imagen adjunta para un `<img>`: el servidor solo la sirve en
 * línea si `es_imagen`, y con la misma sesión y permiso que la descarga.
 */
export const urlImagen = (adjunto: Adjunto | number) =>
  urlApi(`${V1}/adjuntos/${typeof adjunto === "number" ? adjunto : adjunto.id}/?ver=1`);

type Tarjeta = { id: number; numero: number };

/**
 * Tras subir o quitar: la tarjeta del tablero muestra cuántos adjuntos tiene y
 * su portada (la primera imagen, como en el servidor), sin volver a pedir el
 * tablero entero.
 */
function reflejarEnTablero(qc: QueryClient, tableroId: number, card: Tarjeta) {
  const adjuntos = qc.getQueryData<CardDetalle>(claves.card(tableroId, card.numero))?.adjuntos;
  if (!adjuntos) {
    qc.invalidateQueries({ queryKey: claves.tablero(tableroId), exact: true });
    return;
  }
  const portada = adjuntos.find((a) => a.es_imagen)?.id ?? null;
  editarTablero(qc, tableroId, (t) => ({
    ...t,
    cards: t.cards.map((c) => (c.id === card.id ? { ...c, num_adjuntos: adjuntos.length, portada } : c)),
  }));
  qc.invalidateQueries({ queryKey: claves.misTareas });
}

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
      reflejarEnTablero(qc, tableroId, card);
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
      reflejarEnTablero(qc, tableroId, card);
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
