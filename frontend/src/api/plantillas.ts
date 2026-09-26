/** Plantillas de tablero (fase 5): listar, guardar un tablero, usar, gestionar. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { avisarError, claves } from "./queries";
import type { AlcancePlantilla, Plantilla } from "./tipos";

const V1 = "/api/v1";
const CLAVE = ["plantillas"] as const;

export const usePlantillas = (habilitado = true) =>
  useQuery({
    queryKey: CLAVE,
    queryFn: () => api.get<Plantilla[]>(`${V1}/plantillas/`),
    enabled: habilitado,
    staleTime: 60_000,
  });

export function useGuardarPlantilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: {
      tablero: number;
      nombre: string;
      descripcion?: string;
      alcance: AlcancePlantilla;
      equipo?: number | null;
    }) => api.post<Plantilla>(`${V1}/plantillas/`, datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
    onError: avisarError,
  });
}

export function useEditarPlantilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: { nombre?: string; descripcion?: string } }) =>
      api.patch<Plantilla>(`${V1}/plantillas/${id}/`, cambios),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
    onError: avisarError,
  });
}

export function useEliminarPlantilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`${V1}/plantillas/${id}/`),
    onMutate: (id) => qc.setQueryData<Plantilla[]>(CLAVE, (lista) => (lista ?? []).filter((p) => p.id !== id)),
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: CLAVE });
    },
  });
}

/** Crea el tablero desde la plantilla; devuelve su id para navegar a él. */
export function useUsarPlantilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...datos
    }: {
      id: number;
      nombre: string;
      equipo: number | null;
      fecha_inicio: string;
    }) => api.post<{ tablero: number }>(`${V1}/plantillas/${id}/usar/`, datos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.tableros });
      qc.invalidateQueries({ queryKey: ["equipo"] });
    },
    onError: avisarError,
  });
}
