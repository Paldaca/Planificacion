/**
 * Configuración de un tablero (fase 5): etiquetas y campos personalizados.
 * Separado de `queries.ts` (auditoría A-11): mismo patrón, misma caché del
 * tablero (`claves.tablero`), que se actualiza sin volver a pedirlo entero.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { avisarError, claves, editarTablero } from "./queries";
import type { CampoPersonalizado, Etiqueta, TipoCampo } from "./tipos";

const V1 = "/api/v1";

// --- Etiquetas -------------------------------------------------------------------------

export function useCrearEtiqueta(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre: string; color: string }) =>
      api.post<Etiqueta>(`${V1}/tableros/${tableroId}/etiquetas/`, datos),
    onSuccess: (etiqueta) =>
      editarTablero(qc, tableroId, (t) => ({ ...t, etiquetas: [...t.etiquetas, etiqueta] })),
    onError: avisarError,
  });
}

export function useEditarEtiqueta(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: { nombre?: string; color?: string } }) =>
      api.patch<Etiqueta>(`${V1}/etiquetas/${id}/`, cambios),
    onSuccess: (etiqueta) =>
      editarTablero(qc, tableroId, (t) => ({
        ...t,
        etiquetas: t.etiquetas.map((e) => (e.id === etiqueta.id ? etiqueta : e)),
      })),
    onError: avisarError,
  });
}

export function useEliminarEtiqueta(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`${V1}/etiquetas/${id}/`),
    onMutate: (id) =>
      editarTablero(qc, tableroId, (t) => ({
        ...t,
        etiquetas: t.etiquetas.filter((e) => e.id !== id),
        cards: t.cards.map((c) => (c.etiquetas.includes(id) ? { ...c, etiquetas: c.etiquetas.filter((e) => e !== id) } : c)),
      })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card", tableroId] }),
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}

// --- Campos personalizados ------------------------------------------------------------

export type CambiosCampo = Partial<Pick<CampoPersonalizado, "nombre" | "opciones" | "visible_en_tarjeta" | "orden" | "archivado">>;

export function useCrearCampo(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre: string; tipo: TipoCampo; opciones?: string[]; visible_en_tarjeta?: boolean }) =>
      api.post<CampoPersonalizado>(`${V1}/tableros/${tableroId}/campos/`, datos),
    onSuccess: (campo) => editarTablero(qc, tableroId, (t) => ({ ...t, campos: [...t.campos, campo] })),
    onError: avisarError,
  });
}

export function useEditarCampo(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: CambiosCampo }) =>
      api.patch<CampoPersonalizado>(`${V1}/campos/${id}/`, cambios),
    onMutate: ({ id, cambios }) =>
      editarTablero(qc, tableroId, (t) => ({
        ...t,
        campos: t.campos.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
      })),
    onSuccess: (campo) =>
      editarTablero(qc, tableroId, (t) => ({ ...t, campos: t.campos.map((c) => (c.id === campo.id ? campo : c)) })),
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}
