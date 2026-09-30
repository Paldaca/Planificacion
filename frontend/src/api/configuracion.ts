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
    mutationFn: ({ id, cambios }: { id: number; cambios: { nombre?: string; color?: string; es_hito?: boolean } }) =>
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

export type CambiosCampo = Partial<Pick<CampoPersonalizado, "nombre" | "opciones" | "visible_en_tarjeta" | "orden" | "archivado">> & {
  /** {opción vieja: nueva} de una lista: el servidor la cambia también en las tarjetas que la tenían. */
  renombrar?: Record<string, string>;
};

export function useCrearCampo(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre: string; tipo: TipoCampo; opciones?: string[]; visible_en_tarjeta?: boolean }) =>
      api.post<CampoPersonalizado>(`${V1}/tableros/${tableroId}/campos/`, datos),
    onSuccess: (campo) => editarTablero(qc, tableroId, (t) => ({ ...t, campos: [...t.campos, campo] })),
    onError: avisarError,
  });
}

/**
 * Optimista y **en serie** (`scope`): el editor de opciones manda la lista
 * entera en cada cambio (añadir, renombrar, ordenar, quitar), así que dos
 * cambios seguidos deben llegar en orden. La respuesta de uno no pisa la
 * caché mientras haya otro en cola, y al vaciarse la cola se vuelve a pedir el
 * tablero (un refresco a medias pudo traer un estado intermedio, y renombrar
 * una opción cambia tarjetas).
 */
export function useEditarCampo(tableroId: number) {
  const qc = useQueryClient();
  const clave = ["campos", tableroId];
  return useMutation({
    mutationKey: clave,
    scope: { id: `campos-${tableroId}` },
    mutationFn: ({ id, cambios }: { id: number; cambios: CambiosCampo }) =>
      api.patch<CampoPersonalizado>(`${V1}/campos/${id}/`, cambios),
    onMutate: ({ id, cambios: { renombrar, ...cambios } }) => {
      // Un refresco en vuelo traería el estado anterior a este cambio.
      void qc.cancelQueries({ queryKey: claves.tablero(tableroId), exact: true });
      editarTablero(qc, tableroId, (t) => ({
        ...t,
        campos: t.campos.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
        cards: renombrar
          ? t.cards.map((c) => {
              const nueva = renombrar[String(c.campos[String(id)] ?? "")];
              return nueva ? { ...c, campos: { ...c.campos, [String(id)]: nueva } } : c;
            })
          : t.cards,
      }));
    },
    onSuccess: (campo, { cambios }) => {
      // Las tarjetas abiertas guardan su propia copia de los valores.
      if (cambios.renombrar) qc.invalidateQueries({ queryKey: ["card", tableroId] });
      // Esta mutación todavía cuenta como en curso: más de una = hay cambios posteriores en cola.
      if (qc.isMutating({ mutationKey: clave }) > 1) return;
      editarTablero(qc, tableroId, (t) => ({ ...t, campos: t.campos.map((c) => (c.id === campo.id ? campo : c)) }));
      if (cambios.opciones) qc.invalidateQueries({ queryKey: claves.tablero(tableroId), exact: true });
    },
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}
