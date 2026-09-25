/**
 * Hooks de datos (TanStack Query) sobre la API `/api/v1/`.
 *
 * - Las ediciones de una tarjeta se aplican al instante en pantalla
 *   (optimistas) y se envían EN SERIE (`scope`): cada PATCH lee la `version`
 *   vigente justo antes de salir, así dos cambios seguidos del mismo usuario
 *   nunca chocan entre sí con un 409 falso.
 * - Un 409 real (otra persona editó) reemplaza la tarjeta por la versión del
 *   servidor y lo avisa.
 * - Sin sondeo periódico: los datos se refrescan al volver a la pestaña
 *   (acción real del usuario). Ver R-07 en docs/plan-modulo-planificacion.md §6.5.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { calcularVencimiento } from "@/lib/vencimiento";

import { ApiError, api, mensajeError } from "./client";
import type {
  CardDetalle,
  CardResumen,
  Columna,
  Comentario,
  Equipo,
  Invitacion,
  Miembro,
  MisTarea,
  Persona,
  RolEquipo,
  TableroDetalle,
  TableroResumen,
  Urgencia,
} from "./tipos";

const V1 = "/api/v1";

export const claves = {
  tableros: ["tableros"] as const,
  tablero: (id: number) => ["tablero", id] as const,
  archivadas: (id: number) => ["tablero", id, "archivadas"] as const,
  card: (tableroId: number, numero: number) => ["card", tableroId, numero] as const,
  comentarios: (cardId: number) => ["comentarios", cardId] as const,
  misTareas: ["mis-tareas"] as const,
  equipos: ["equipos"] as const,
  equipo: (id: number) => ["equipo", id] as const,
  miembros: (id: number) => ["equipo", id, "miembros"] as const,
  invitacionesEquipo: (id: number) => ["equipo", id, "invitaciones"] as const,
  tablerosEquipo: (id: number) => ["equipo", id, "tableros"] as const,
  misInvitaciones: ["invitaciones"] as const,
  personas: (q: string, equipo?: number) => ["personas", q, equipo ?? null] as const,
};

function avisarError(error: unknown) {
  toast.error(mensajeError(error));
}

// --- Lecturas ---------------------------------------------------------------------

export const useTableros = () =>
  useQuery({ queryKey: claves.tableros, queryFn: () => api.get<TableroResumen[]>(`${V1}/tableros/`) });

export const useTablero = (id: number) =>
  useQuery({
    queryKey: claves.tablero(id),
    queryFn: () => api.get<TableroDetalle>(`${V1}/tableros/${id}/`),
    enabled: Number.isFinite(id),
  });

export const useArchivadas = (id: number, habilitado: boolean) =>
  useQuery({
    queryKey: claves.archivadas(id),
    queryFn: () => api.get<CardDetalle[]>(`${V1}/tableros/${id}/archivadas/`),
    enabled: habilitado,
  });

export const useCard = (tableroId: number, numero: number) =>
  useQuery({
    queryKey: claves.card(tableroId, numero),
    queryFn: () => api.get<CardDetalle>(`${V1}/tableros/${tableroId}/cards/${numero}/`),
    enabled: Number.isFinite(tableroId) && Number.isFinite(numero),
  });

export const useComentarios = (cardId: number | undefined) =>
  useQuery({
    queryKey: claves.comentarios(cardId ?? -1),
    queryFn: () => api.get<Comentario[]>(`${V1}/cards/${cardId}/comentarios/`),
    enabled: cardId !== undefined,
  });

export const useMisTareas = () =>
  useQuery({ queryKey: claves.misTareas, queryFn: () => api.get<MisTarea[]>(`${V1}/mis-tareas/`) });

export const useEquipos = () =>
  useQuery({ queryKey: claves.equipos, queryFn: () => api.get<Equipo[]>(`${V1}/equipos/`) });

export const useEquipo = (id: number) =>
  useQuery({
    queryKey: claves.equipo(id),
    queryFn: () => api.get<Equipo>(`${V1}/equipos/${id}/`),
    enabled: Number.isFinite(id),
  });

export const useMiembros = (id: number) =>
  useQuery({
    queryKey: claves.miembros(id),
    queryFn: () => api.get<Miembro[]>(`${V1}/equipos/${id}/miembros/`),
    enabled: Number.isFinite(id),
  });

export const useInvitacionesEquipo = (id: number, habilitado: boolean) =>
  useQuery({
    queryKey: claves.invitacionesEquipo(id),
    queryFn: () => api.get<Invitacion[]>(`${V1}/equipos/${id}/invitaciones/`),
    enabled: habilitado,
  });

export const useTablerosEquipo = (id: number) =>
  useQuery({
    queryKey: claves.tablerosEquipo(id),
    queryFn: () => api.get<TableroResumen[]>(`${V1}/equipos/${id}/tableros/`),
    enabled: Number.isFinite(id),
  });

export const useMisInvitaciones = () =>
  useQuery({
    queryKey: claves.misInvitaciones,
    queryFn: () => api.get<Invitacion[]>(`${V1}/invitaciones/`),
  });

export const usePersonas = (q: string, equipo?: number) =>
  useQuery({
    queryKey: claves.personas(q, equipo),
    queryFn: () =>
      api.get<Persona[]>(
        `${V1}/personas/?q=${encodeURIComponent(q)}${equipo ? `&equipo=${equipo}` : ""}`,
      ),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });

// --- Utilidades de caché del tablero ------------------------------------------------

function editarTablero(qc: QueryClient, id: number, cambio: (t: TableroDetalle) => TableroDetalle) {
  qc.setQueryData<TableroDetalle>(claves.tablero(id), (t) => (t ? cambio(t) : t));
}

function reemplazarCard(qc: QueryClient, tableroId: number, card: CardResumen) {
  editarTablero(qc, tableroId, (t) => ({
    ...t,
    cards: t.cards.map((c) => (c.id === card.id ? { ...c, ...card } : c)),
  }));
}

const porOrden = (a: { orden: number; id: number }, b: { orden: number; id: number }) =>
  a.orden - b.orden || a.id - b.id;

/** Aplica en caché lo mismo que hace `servicios.mover_card` en el servidor. */
function aplicarMovimiento(t: TableroDetalle, cardId: number, columnaId: number, posicion: number) {
  const cards = t.cards.map((c) => ({ ...c }));
  const card = cards.find((c) => c.id === cardId);
  const columna = t.columnas.find((c) => c.id === columnaId);
  if (!card || !columna) return t;
  const origen = card.columna;
  const destino = cards.filter((c) => c.columna === columnaId && c.id !== cardId).sort(porOrden);
  destino.splice(Math.max(0, Math.min(posicion, destino.length)), 0, card);
  card.columna = columnaId;
  destino.forEach((c, i) => (c.orden = i));
  if (origen !== columnaId) {
    cards
      .filter((c) => c.columna === origen)
      .sort(porOrden)
      .forEach((c, i) => (c.orden = i));
  }
  card.completada_en = columna.es_final ? (card.completada_en ?? new Date().toISOString()) : null;
  card.vencimiento = calcularVencimiento(card.fecha_fin, columna.es_final);
  return { ...t, cards };
}

/** Aplicación síncrona (al soltar en el tablero) para evitar un fotograma de rebote. */
export function moverEnCache(qc: QueryClient, tableroId: number, cardId: number, columna: number, posicion: number) {
  editarTablero(qc, tableroId, (t) => aplicarMovimiento(t, cardId, columna, posicion));
}

export function reordenarEnCache(qc: QueryClient, tableroId: number, orden: number[]) {
  editarTablero(qc, tableroId, (t) => ({
    ...t,
    columnas: orden
      .map((id, i) => {
        const c = t.columnas.find((x) => x.id === id);
        return c ? { ...c, orden: i } : null;
      })
      .filter((c): c is Columna => c !== null),
  }));
}

// --- Tableros y columnas ----------------------------------------------------------------

export function useCrearTablero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre: string; descripcion?: string; equipo: number }) =>
      api.post<TableroDetalle>(`${V1}/tableros/`, datos),
    onSuccess: (t) => {
      qc.setQueryData(claves.tablero(t.id), t);
      qc.invalidateQueries({ queryKey: claves.tableros });
      if (t.equipo) {
        qc.invalidateQueries({ queryKey: claves.tablerosEquipo(t.equipo.id) });
        qc.invalidateQueries({ queryKey: claves.equipo(t.equipo.id) });
      }
    },
    onError: avisarError,
  });
}

export function useEditarTablero(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre?: string; descripcion?: string }) =>
      api.patch<TableroDetalle>(`${V1}/tableros/${id}/`, datos),
    onSuccess: (t) => {
      qc.setQueryData(claves.tablero(id), t);
      qc.invalidateQueries({ queryKey: claves.tableros });
    },
    onError: avisarError,
  });
}

export function useArchivarTablero(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archivado: boolean) => api.post<TableroResumen>(`${V1}/tableros/${id}/archivar/`, { archivado }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: claves.tableros });
      qc.invalidateQueries({ queryKey: claves.tablero(id) });
      if (t.equipo) qc.invalidateQueries({ queryKey: ["equipo", t.equipo.id] });
    },
    onError: avisarError,
  });
}

export function useCrearColumna(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nombre: string) => api.post<Columna>(`${V1}/tableros/${tableroId}/columnas/`, { nombre }),
    onSuccess: (col) => editarTablero(qc, tableroId, (t) => ({ ...t, columnas: [...t.columnas, col] })),
    onError: avisarError,
  });
}

export function useEditarColumna(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `columnas-${tableroId}` },
    mutationFn: ({ id, cambios }: { id: number; cambios: Partial<Pick<Columna, "nombre" | "es_final">> }) => {
      const version = qc.getQueryData<TableroDetalle>(claves.tablero(tableroId))?.columnas.find((c) => c.id === id)?.version;
      return api.patch<Columna>(`${V1}/columnas/${id}/`, { ...cambios, version });
    },
    onMutate: ({ id, cambios }) =>
      editarTablero(qc, tableroId, (t) => ({
        ...t,
        columnas: t.columnas.map((c) => (c.id === id ? { ...c, ...cambios } : c)),
      })),
    onSuccess: (col, { cambios }) => {
      editarTablero(qc, tableroId, (t) => ({ ...t, columnas: t.columnas.map((c) => (c.id === col.id ? col : c)) }));
      if ("es_final" in cambios) {
        qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
        qc.invalidateQueries({ queryKey: claves.misTareas });
      }
    },
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}

export function useArchivarColumna(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moverA }: { id: number; moverA?: number }) =>
      api.post(`${V1}/columnas/${id}/archivar/`, moverA ? { mover_a: moverA } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
      qc.invalidateQueries({ queryKey: claves.misTareas });
    },
    onError: avisarError,
  });
}

export function useReordenarColumnas(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `columnas-${tableroId}` },
    mutationFn: (orden: number[]) => api.post<Columna[]>(`${V1}/tableros/${tableroId}/columnas/reordenar/`, { orden }),
    onMutate: (orden) => reordenarEnCache(qc, tableroId, orden),
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}

// --- Cards ------------------------------------------------------------------------------

export type CambiosCard = {
  titulo?: string;
  descripcion?: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  urgencia?: Urgencia;
  responsables?: number[];
  columna?: number;
};

export function useCrearCard(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: CambiosCard & { titulo: string }) =>
      api.post<CardDetalle>(`${V1}/tableros/${tableroId}/cards/`, datos),
    onSuccess: (card) => {
      editarTablero(qc, tableroId, (t) => ({ ...t, cards: [...t.cards, card] }));
      qc.setQueryData(claves.card(tableroId, card.numero), card);
      if (card.responsables.length) qc.invalidateQueries({ queryKey: claves.misTareas });
    },
    onError: avisarError,
  });
}

export function useMoverCard(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `mover-${tableroId}` },
    mutationFn: ({ cardId, columna, posicion }: { cardId: number; columna: number; posicion: number }) =>
      api.post<CardDetalle>(`${V1}/cards/${cardId}/mover/`, { columna, posicion }),
    onMutate: ({ cardId, columna, posicion }) => moverEnCache(qc, tableroId, cardId, columna, posicion),
    onSuccess: (card) => {
      reemplazarCard(qc, tableroId, card);
      qc.setQueryData(claves.card(tableroId, card.numero), card);
      qc.invalidateQueries({ queryKey: claves.misTareas });
    },
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}

export function usePatchCard(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `cards-${tableroId}` },
    mutationFn: ({ card, cambios }: { card: { id: number; numero: number }; cambios: CambiosCard }) => {
      const version =
        qc.getQueryData<CardDetalle>(claves.card(tableroId, card.numero))?.version ??
        qc.getQueryData<TableroDetalle>(claves.tablero(tableroId))?.cards.find((c) => c.id === card.id)?.version;
      return api.patch<CardDetalle>(`${V1}/cards/${card.id}/`, { ...cambios, version });
    },
    onMutate: ({ card, cambios }) => {
      const tablero = qc.getQueryData<TableroDetalle>(claves.tablero(tableroId));
      const { responsables, columna, ...simples } = cambios;
      const extra: Partial<CardResumen> = { ...simples };
      if (responsables && tablero) {
        extra.responsables = responsables
          .map((id) => tablero.personas.find((p) => p.id === id))
          .filter((p): p is Persona => Boolean(p));
      }
      if ("fecha_fin" in cambios) {
        const actual = tablero?.cards.find((c) => c.id === card.id);
        extra.vencimiento = calcularVencimiento(cambios.fecha_fin ?? null, Boolean(actual?.completada_en));
      }
      qc.setQueryData<CardDetalle>(claves.card(tableroId, card.numero), (c) => (c ? { ...c, ...extra } : c));
      editarTablero(qc, tableroId, (t) => {
        let nuevo = { ...t, cards: t.cards.map((c) => (c.id === card.id ? { ...c, ...extra } : c)) };
        if (columna !== undefined) nuevo = aplicarMovimiento(nuevo, card.id, columna, 10 ** 6);
        return nuevo;
      });
    },
    onSuccess: (card) => {
      qc.setQueryData(claves.card(tableroId, card.numero), card);
      reemplazarCard(qc, tableroId, card);
      qc.invalidateQueries({ queryKey: claves.misTareas });
    },
    onError: (error, { card }) => {
      if (error instanceof ApiError && error.status === 409) {
        const actual = (error.body as { actual?: CardDetalle })?.actual;
        if (actual) {
          qc.setQueryData(claves.card(tableroId, card.numero), actual);
          reemplazarCard(qc, tableroId, actual);
        }
        toast.warning(mensajeError(error));
        return;
      }
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.card(tableroId, card.numero) });
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}

export function useArchivarCard(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ card, archivada }: { card: { id: number; numero: number }; archivada: boolean }) =>
      api.post<CardDetalle>(`${V1}/cards/${card.id}/archivar/`, { archivada }),
    onMutate: ({ card, archivada }) => {
      if (archivada) {
        editarTablero(qc, tableroId, (t) => ({ ...t, cards: t.cards.filter((c) => c.id !== card.id) }));
      }
    },
    onSuccess: (card) => {
      qc.setQueryData(claves.card(tableroId, card.numero), card);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
      qc.invalidateQueries({ queryKey: claves.misTareas });
    },
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}

// --- Comentarios ------------------------------------------------------------------------

function contarComentarios(qc: QueryClient, tableroId: number, cardId: number, delta: number) {
  editarTablero(qc, tableroId, (t) => ({
    ...t,
    cards: t.cards.map((c) => (c.id === cardId ? { ...c, comentarios: Math.max(0, c.comentarios + delta) } : c)),
  }));
}

export function useCrearComentario(tableroId: number, cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => api.post<Comentario>(`${V1}/cards/${cardId}/comentarios/`, { texto }),
    onSuccess: (comentario) => {
      qc.setQueryData<Comentario[]>(claves.comentarios(cardId), (lista) => [...(lista ?? []), comentario]);
      contarComentarios(qc, tableroId, cardId, 1);
    },
    onError: avisarError,
  });
}

export function useEditarComentario(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, texto }: { id: number; texto: string }) =>
      api.patch<Comentario>(`${V1}/comentarios/${id}/`, { texto }),
    onSuccess: (comentario) =>
      qc.setQueryData<Comentario[]>(claves.comentarios(cardId), (lista) =>
        (lista ?? []).map((c) => (c.id === comentario.id ? comentario : c)),
      ),
    onError: avisarError,
  });
}

export function useBorrarComentario(tableroId: number, cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`${V1}/comentarios/${id}/`),
    onSuccess: (_r, id) => {
      qc.setQueryData<Comentario[]>(claves.comentarios(cardId), (lista) =>
        (lista ?? []).map((c) => (c.id === id ? { ...c, eliminado: true, texto: "" } : c)),
      );
      contarComentarios(qc, tableroId, cardId, -1);
    },
    onError: avisarError,
  });
}

// --- Equipos ------------------------------------------------------------------------------

export function useCrearEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre: string; descripcion?: string; color?: string }) =>
      api.post<Equipo>(`${V1}/equipos/`, datos),
    onSuccess: (equipo) => {
      qc.setQueryData<Equipo[]>(claves.equipos, (lista) => [...(lista ?? []), equipo]);
      qc.setQueryData(claves.equipo(equipo.id), equipo);
    },
    onError: avisarError,
  });
}

export function useEditarEquipo(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { nombre?: string; descripcion?: string; color?: string }) =>
      api.patch<Equipo>(`${V1}/equipos/${id}/`, datos),
    onSuccess: (equipo) => {
      qc.setQueryData(claves.equipo(id), equipo);
      qc.invalidateQueries({ queryKey: claves.equipos });
      qc.invalidateQueries({ queryKey: claves.tableros });
    },
    onError: avisarError,
  });
}

export function useArchivarEquipo(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Equipo>(`${V1}/equipos/${id}/archivar/`, { archivado: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.equipos });
      qc.invalidateQueries({ queryKey: claves.tableros });
      qc.invalidateQueries({ queryKey: claves.misTareas });
    },
    onError: avisarError,
  });
}

export function useCambiarRol(equipoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ miembroId, rol }: { miembroId: number; rol: RolEquipo }) =>
      api.patch<Miembro>(`${V1}/equipos/${equipoId}/miembros/${miembroId}/`, { rol }),
    onSuccess: (miembro) => {
      qc.setQueryData<Miembro[]>(claves.miembros(equipoId), (lista) =>
        (lista ?? []).map((m) => (m.id === miembro.id ? miembro : m)),
      );
      qc.invalidateQueries({ queryKey: claves.equipo(equipoId) });
    },
    onError: avisarError,
  });
}

export function useQuitarMiembro(equipoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (miembroId: number) => api.del(`${V1}/equipos/${equipoId}/miembros/${miembroId}/`),
    onSuccess: (_r, miembroId) => {
      qc.setQueryData<Miembro[]>(claves.miembros(equipoId), (lista) => (lista ?? []).filter((m) => m.id !== miembroId));
      qc.invalidateQueries({ queryKey: claves.equipo(equipoId) });
      qc.invalidateQueries({ queryKey: claves.equipos });
    },
    onError: avisarError,
  });
}

export function useSalirEquipo(equipoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`${V1}/equipos/${equipoId}/salir/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.equipos });
      qc.invalidateQueries({ queryKey: claves.tableros });
      qc.invalidateQueries({ queryKey: claves.misTareas });
    },
    onError: avisarError,
  });
}

export function useInvitar(equipoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { usuario: number; rol: RolEquipo; mensaje?: string }) =>
      api.post<Invitacion>(`${V1}/equipos/${equipoId}/invitaciones/`, datos),
    onSuccess: (inv) => {
      qc.setQueryData<Invitacion[]>(claves.invitacionesEquipo(equipoId), (lista) => [inv, ...(lista ?? [])]);
      qc.invalidateQueries({ queryKey: claves.equipo(equipoId) });
      qc.invalidateQueries({ queryKey: ["personas"] });
    },
    onError: avisarError,
  });
}

export function useCancelarInvitacion(equipoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<Invitacion>(`${V1}/invitaciones/${id}/cancelar/`),
    onSuccess: (inv) => {
      qc.setQueryData<Invitacion[]>(claves.invitacionesEquipo(equipoId), (lista) =>
        (lista ?? []).filter((i) => i.id !== inv.id),
      );
      qc.invalidateQueries({ queryKey: claves.equipo(equipoId) });
    },
    onError: avisarError,
  });
}

export function useResponderInvitacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, aceptar }: { id: number; aceptar: boolean }) =>
      api.post<Invitacion & { equipo_detalle?: Equipo }>(
        `${V1}/invitaciones/${id}/${aceptar ? "aceptar" : "rechazar"}/`,
      ),
    onSuccess: (inv) => {
      qc.setQueryData<Invitacion[]>(claves.misInvitaciones, (lista) => (lista ?? []).filter((i) => i.id !== inv.id));
      if (inv.estado === "aceptada") {
        qc.invalidateQueries({ queryKey: claves.equipos });
        qc.invalidateQueries({ queryKey: claves.tableros });
      }
    },
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.misInvitaciones });
    },
  });
}
