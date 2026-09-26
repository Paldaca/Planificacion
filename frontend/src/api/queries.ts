/**
 * Hooks de datos (TanStack Query) sobre la API `/api/v1/`.
 *
 * - Las ediciones de una tarjeta se aplican al instante en pantalla
 *   (optimistas) y se envían EN SERIE (`scope`): cada PATCH lee la `version`
 *   vigente justo antes de salir, así dos cambios seguidos del mismo usuario
 *   nunca chocan entre sí con un 409 falso.
 * - Un 409 real (otra persona editó) reemplaza la tarjeta por la versión del
 *   servidor y lo avisa.
 * - Refresco automático solo con la pestaña visible y el usuario activo
 *   (`refrescoVivo`, R-07 en docs/plan-modulo-planificacion.md §6.5), además
 *   de al volver a la pestaña.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { refrescoVivo } from "@/lib/actividadUsuario";
import { calcularVencimiento } from "@/lib/vencimiento";

import { ApiError, api, descargar, mensajeError } from "./client";
import type {
  Actividad,
  CardDetalle,
  ItemChecklist,
  CardResumen,
  Columna,
  Comentario,
  Dependencia,
  EnGantt,
  Equipo,
  Feriado,
  FormatoExportacion,
  ResultadoImportacion,
  VistaPrevia,
  Invitacion,
  Miembro,
  MisTarea,
  BusquedaPersonas,
  Persona,
  RolEquipo,
  TableroDetalle,
  TableroResumen,
  TipoDependencia,
  Urgencia,
} from "./tipos";

const V1 = "/api/v1";

export const claves = {
  tableros: ["tableros"] as const,
  personalesArchivados: ["tableros", "archivados"] as const,
  tablero: (id: number) => ["tablero", id] as const,
  archivadas: (id: number) => ["tablero", id, "archivadas"] as const,
  card: (tableroId: number, numero: number) => ["card", tableroId, numero] as const,
  comentarios: (cardId: number) => ["comentarios", cardId] as const,
  actividad: (cardId: number) => ["actividad", cardId] as const,
  misTareas: ["mis-tareas"] as const,
  equipos: ["equipos"] as const,
  equipo: (id: number) => ["equipo", id] as const,
  miembros: (id: number) => ["equipo", id, "miembros"] as const,
  invitacionesEquipo: (id: number) => ["equipo", id, "invitaciones"] as const,
  tablerosEquipo: (id: number) => ["equipo", id, "tableros"] as const,
  misInvitaciones: ["invitaciones"] as const,
  personas: (q: string, equipo?: number) => ["personas", q, equipo ?? null] as const,
  dependencias: (tableroId: number) => ["tablero", tableroId, "dependencias"] as const,
  feriados: (desde: string, hasta: string) => ["feriados", desde, hasta] as const,
};

export function avisarError(error: unknown) {
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
    refetchInterval: refrescoVivo(20_000),
  });

/** Tableros personales archivados (los de equipo se ven en la página del equipo). */
export const usePersonalesArchivados = (habilitado: boolean) =>
  useQuery({
    queryKey: claves.personalesArchivados,
    queryFn: () => api.get<TableroResumen[]>(`${V1}/tableros/?archivados=personales`),
    enabled: habilitado,
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
    refetchInterval: refrescoVivo(20_000),
  });

export const useComentarios = (cardId: number | undefined) =>
  useQuery({
    queryKey: claves.comentarios(cardId ?? -1),
    queryFn: () => api.get<Comentario[]>(`${V1}/cards/${cardId}/comentarios/`),
    enabled: cardId !== undefined,
    refetchInterval: refrescoVivo(15_000),
  });

export const useActividad = (cardId: number | undefined, habilitado: boolean) =>
  useQuery({
    queryKey: claves.actividad(cardId ?? -1),
    queryFn: () => api.get<Actividad[]>(`${V1}/cards/${cardId}/actividad/`),
    enabled: habilitado && cardId !== undefined,
    refetchInterval: refrescoVivo(30_000),
  });

export const useMisTareas = () =>
  useQuery({
    queryKey: claves.misTareas,
    queryFn: () => api.get<MisTarea[]>(`${V1}/mis-tareas/`),
    refetchInterval: refrescoVivo(30_000),
  });

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
    refetchInterval: refrescoVivo(60_000),
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
    refetchInterval: refrescoVivo(60_000),
  });

export const usePersonas = (q: string, equipo?: number) =>
  useQuery({
    queryKey: claves.personas(q, equipo),
    queryFn: () =>
      api.get<BusquedaPersonas>(
        `${V1}/personas/?q=${encodeURIComponent(q)}${equipo ? `&equipo=${equipo}` : ""}`,
      ),
    enabled: q.trim().length >= 3,
    staleTime: 30_000,
  });

export const useDependencias = (tableroId: number, habilitado = true) =>
  useQuery({
    queryKey: claves.dependencias(tableroId),
    queryFn: () => api.get<Dependencia[]>(`${V1}/tableros/${tableroId}/dependencias/`),
    enabled: habilitado && Number.isFinite(tableroId),
    refetchInterval: refrescoVivo(30_000),
  });

/** Feriados entre dos fechas "YYYY-MM-DD" (fijos, puntuales y móviles). */
export const useFeriados = (desde: string, hasta: string) =>
  useQuery({
    queryKey: claves.feriados(desde, hasta),
    queryFn: () => api.get<Feriado[]>(`${V1}/calendario/feriados/?desde=${desde}&hasta=${hasta}`),
    staleTime: 10 * 60_000,
    placeholderData: (previo) => previo,
  });

// --- Utilidades de caché del tablero ------------------------------------------------

export function editarTablero(qc: QueryClient, id: number, cambio: (t: TableroDetalle) => TableroDetalle) {
  qc.setQueryData<TableroDetalle>(claves.tablero(id), (t) => (t ? cambio(t) : t));
}

/** Espejo de `Card.entra_en_gantt` para las actualizaciones optimistas. */
function entraEnGantt(enGantt: EnGantt, columna: Columna | undefined): boolean {
  if (enGantt === "heredar") return columna?.incluir_en_gantt ?? true;
  return enGantt === "si";
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
    /** Sin `equipo` (o `null`), el tablero es personal. */
    mutationFn: (datos: { nombre: string; descripcion?: string; equipo?: number | null }) =>
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

/** Restaurar un tablero archivado desde un listado (id variable). */
export function useRestaurarTablero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<TableroResumen>(`${V1}/tableros/${id}/archivar/`, { archivado: false }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: claves.tableros });
      qc.invalidateQueries({ queryKey: claves.tablero(t.id) });
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
    mutationFn: ({
      id,
      cambios,
    }: {
      id: number;
      cambios: Partial<Pick<Columna, "nombre" | "es_final" | "incluir_en_gantt" | "limite_cards">>;
    }) => {
      const version = qc.getQueryData<TableroDetalle>(claves.tablero(tableroId))?.columnas.find((c) => c.id === id)?.version;
      return api.patch<Columna>(`${V1}/columnas/${id}/`, { ...cambios, version });
    },
    onMutate: ({ id, cambios }) =>
      editarTablero(qc, tableroId, (t) => {
        const columnas = t.columnas.map((c) => (c.id === id ? { ...c, ...cambios } : c));
        const columna = columnas.find((c) => c.id === id);
        const cards =
          "incluir_en_gantt" in cambios
            ? t.cards.map((c) =>
                c.columna === id ? { ...c, en_gantt_efectivo: entraEnGantt(c.en_gantt, columna) } : c,
              )
            : t.cards;
        return { ...t, columnas, cards };
      }),
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
  en_gantt?: EnGantt;
  etiquetas?: number[];
  /** Solo los campos que cambian; `null` borra el valor. */
  campos?: Record<string, string | number | null>;
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
      const { responsables, columna, campos, ...simples } = cambios;
      const extra: Partial<CardResumen> = { ...simples };
      const actualCampos = tablero?.cards.find((c) => c.id === card.id)?.campos;
      if (campos) {
        const nuevos = { ...(actualCampos ?? {}) };
        for (const [id, valor] of Object.entries(campos)) {
          if (valor === null || valor === "") delete nuevos[id];
          else nuevos[id] = valor;
        }
        extra.campos = nuevos;
      }
      if (responsables && tablero) {
        extra.responsables = responsables
          .map((id) => tablero.personas.find((p) => p.id === id))
          .filter((p): p is Persona => Boolean(p));
      }
      const actual = tablero?.cards.find((c) => c.id === card.id);
      if ("fecha_fin" in cambios) {
        extra.vencimiento = calcularVencimiento(cambios.fecha_fin ?? null, Boolean(actual?.completada_en));
      }
      if (cambios.en_gantt && actual) {
        extra.en_gantt_efectivo = entraEnGantt(cambios.en_gantt, tablero?.columnas.find((c) => c.id === actual.columna));
      }
      qc.setQueryData<CardDetalle>(claves.card(tableroId, card.numero), (c) => (c ? { ...c, ...extra } : c));
      editarTablero(qc, tableroId, (t) => {
        let nuevo = { ...t, cards: t.cards.map((c) => (c.id === card.id ? { ...c, ...extra } : c)) };
        if (columna !== undefined) nuevo = aplicarMovimiento(nuevo, card.id, columna, 10 ** 6);
        return nuevo;
      });
    },
    onSuccess: (card, { cambios }) => {
      qc.setQueryData(claves.card(tableroId, card.numero), card);
      reemplazarCard(qc, tableroId, card);
      qc.invalidateQueries({ queryKey: claves.misTareas });
      qc.invalidateQueries({ queryKey: claves.actividad(card.id) });
      if ("fecha_inicio" in cambios || "fecha_fin" in cambios) {
        qc.invalidateQueries({ queryKey: claves.dependencias(tableroId) });
      }
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
      // La lista de archivadas se actualiza YA: si el panel se abrió antes,
      // su caché vacía no debe mostrarse mientras llega la nueva.
      qc.setQueryData<CardDetalle[]>(claves.archivadas(tableroId), (lista) => {
        if (!lista) return lista;
        const sin = lista.filter((c) => c.id !== card.id);
        return card.archivada ? [card, ...sin] : sin;
      });
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
  const sumar = <T extends CardResumen>(c: T): T =>
    c.id === cardId ? { ...c, comentarios: Math.max(0, c.comentarios + delta) } : c;
  editarTablero(qc, tableroId, (t) => ({ ...t, cards: t.cards.map(sumar) }));
  // También la tarjeta abierta (su caché va por número, aquí solo se conoce el id).
  qc.setQueriesData<CardDetalle>({ queryKey: ["card", tableroId] }, (c) => (c ? sumar(c) : c));
}

export function useCrearComentario(tableroId: number, cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => api.post<Comentario>(`${V1}/cards/${cardId}/comentarios/`, { texto }),
    onSuccess: (comentario) => {
      qc.setQueryData<Comentario[]>(claves.comentarios(cardId), (lista) => [...(lista ?? []), comentario]);
      contarComentarios(qc, tableroId, cardId, 1);
      qc.invalidateQueries({ queryKey: claves.actividad(cardId) });
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
    mutationFn: (datos: { usuario?: number; portal_id?: number; rol: RolEquipo; mensaje?: string }) =>
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
      // Pasa al historial del equipo como «cancelada».
      qc.setQueryData<Invitacion[]>(claves.invitacionesEquipo(equipoId), (lista) =>
        (lista ?? []).map((i) => (i.id === inv.id ? inv : i)),
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

// --- Checklist ----------------------------------------------------------------------

type RefCard = { id: number; numero: number };

function cambiarItems(qc: QueryClient, tableroId: number, card: RefCard, cambio: (items: ItemChecklist[]) => ItemChecklist[]) {
  let items: ItemChecklist[] | null = null;
  qc.setQueryData<CardDetalle>(claves.card(tableroId, card.numero), (c) => {
    if (!c) return c;
    items = cambio(c.items);
    return { ...c, items, checklist: { hechos: items.filter((i) => i.hecho).length, total: items.length } };
  });
  const finales = items as ItemChecklist[] | null;
  if (!finales) return;
  editarTablero(qc, tableroId, (t) => ({
    ...t,
    cards: t.cards.map((c) =>
      c.id === card.id ? { ...c, checklist: { hechos: finales.filter((i) => i.hecho).length, total: finales.length } } : c,
    ),
  }));
}

export function useCrearItem(tableroId: number, card: RefCard) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => api.post<ItemChecklist>(`${V1}/cards/${card.id}/checklist/`, { texto }),
    onSuccess: (item) => {
      cambiarItems(qc, tableroId, card, (items) => [...items, item]);
      qc.invalidateQueries({ queryKey: claves.actividad(card.id) });
    },
    onError: avisarError,
  });
}

export function useEditarItem(tableroId: number, card: RefCard) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `checklist-${card.id}` },
    mutationFn: ({ id, cambios }: { id: number; cambios: Partial<Pick<ItemChecklist, "texto" | "hecho">> }) =>
      api.patch<ItemChecklist>(`${V1}/checklist/${id}/`, cambios),
    onMutate: ({ id, cambios }) =>
      cambiarItems(qc, tableroId, card, (items) => items.map((i) => (i.id === id ? { ...i, ...cambios } : i))),
    onSuccess: (item) => {
      cambiarItems(qc, tableroId, card, (items) => items.map((i) => (i.id === item.id ? item : i)));
      qc.invalidateQueries({ queryKey: claves.actividad(card.id) });
    },
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.card(tableroId, card.numero) });
    },
  });
}

export function useBorrarItem(tableroId: number, card: RefCard) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`${V1}/checklist/${id}/`),
    onMutate: (id) => cambiarItems(qc, tableroId, card, (items) => items.filter((i) => i.id !== id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.actividad(card.id) }),
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.card(tableroId, card.numero) });
    },
  });
}

// --- Traslado a un tablero de equipo -----------------------------------------------------

export function useTrasladarCard(tableroOrigenId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, tablero }: { cardId: number; tablero: number }) =>
      api.post<CardDetalle>(`${V1}/cards/${cardId}/trasladar/`, { tablero }),
    onSuccess: (card) => {
      editarTablero(qc, tableroOrigenId, (t) => ({ ...t, cards: t.cards.filter((c) => c.id !== card.id) }));
      qc.setQueryData(claves.card(card.tablero.id, card.numero), card);
      qc.invalidateQueries({ queryKey: claves.tablero(card.tablero.id) });
      qc.invalidateQueries({ queryKey: claves.tableros });
      qc.invalidateQueries({ queryKey: claves.misTareas });
    },
    onError: avisarError,
  });
}

// --- Gantt: reprogramar y dependencias ----------------------------------------------------

/**
 * Nuevas fechas para una tarjeta desde el Gantt o el Calendario. Con
 * `moverSucesoras` el servidor empuja la cadena (en días hábiles) y devuelve
 * TODAS las tarjetas que cambió; se aplican a la caché del tablero, así el
 * Kanban, la Lista y el Calendario lo ven al instante.
 */
export function useProgramarCard(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: `cards-${tableroId}` },
    mutationFn: ({
      card,
      inicio,
      fin,
      moverSucesoras,
    }: {
      card: RefCard;
      inicio: string | null;
      fin: string | null;
      moverSucesoras: boolean;
    }) => {
      const version = qc.getQueryData<TableroDetalle>(claves.tablero(tableroId))?.cards.find((c) => c.id === card.id)?.version;
      return api.post<{ cards: CardResumen[] }>(`${V1}/cards/${card.id}/programar/`, {
        fecha_inicio: inicio,
        fecha_fin: fin,
        version,
        mover_sucesoras: moverSucesoras,
      });
    },
    onMutate: ({ card, inicio, fin }) =>
      editarTablero(qc, tableroId, (t) => ({
        ...t,
        cards: t.cards.map((c) =>
          c.id === card.id
            ? { ...c, fecha_inicio: inicio, fecha_fin: fin, vencimiento: calcularVencimiento(fin, Boolean(c.completada_en)) }
            : c,
        ),
      })),
    onSuccess: ({ cards }, { card }) => {
      const porId = new Map(cards.map((c) => [c.id, c]));
      editarTablero(qc, tableroId, (t) => ({
        ...t,
        cards: t.cards.map((c) => (porId.has(c.id) ? { ...c, ...porId.get(c.id) } : c)),
      }));
      qc.setQueriesData<CardDetalle>({ queryKey: ["card", tableroId] }, (c) =>
        c && porId.has(c.id) ? { ...c, ...porId.get(c.id) } : c,
      );
      qc.invalidateQueries({ queryKey: claves.dependencias(tableroId) });
      qc.invalidateQueries({ queryKey: claves.actividad(card.id) });
      qc.invalidateQueries({ queryKey: claves.misTareas });
      const empujadas = cards.length - 1;
      if (empujadas > 0) {
        toast(empujadas === 1 ? "Se reprogramó 1 tarjeta sucesora" : `Se reprogramaron ${empujadas} tarjetas sucesoras`, {
          description: "Para que ninguna dependencia quede incumplida.",
        });
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) toast.warning(mensajeError(error));
      else avisarError(error);
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
    },
  });
}

export function useCrearDependencia(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { predecesora: number; sucesora: number; tipo?: TipoDependencia; desfase_dias?: number }) =>
      api.post<Dependencia>(`${V1}/tableros/${tableroId}/dependencias/`, datos),
    onSuccess: (dep) => {
      qc.setQueryData<Dependencia[]>(claves.dependencias(tableroId), (lista) => [...(lista ?? []), dep]);
      qc.invalidateQueries({ queryKey: claves.actividad(dep.sucesora) });
    },
    onError: avisarError,
  });
}

export function useEditarDependencia(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: { tipo?: TipoDependencia; desfase_dias?: number } }) =>
      api.patch<Dependencia>(`${V1}/dependencias/${id}/`, cambios),
    onMutate: ({ id, cambios }) =>
      qc.setQueryData<Dependencia[]>(claves.dependencias(tableroId), (lista) =>
        (lista ?? []).map((d) => (d.id === id ? { ...d, ...cambios } : d)),
      ),
    onSuccess: (dep) =>
      qc.setQueryData<Dependencia[]>(claves.dependencias(tableroId), (lista) =>
        (lista ?? []).map((d) => (d.id === dep.id ? dep : d)),
      ),
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.dependencias(tableroId) });
    },
  });
}

export function useEliminarDependencia(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dep: Dependencia) => api.del(`${V1}/dependencias/${dep.id}/`),
    onMutate: (dep) =>
      qc.setQueryData<Dependencia[]>(claves.dependencias(tableroId), (lista) => (lista ?? []).filter((d) => d.id !== dep.id)),
    onSuccess: (_r, dep) => qc.invalidateQueries({ queryKey: claves.actividad(dep.sucesora) }),
    onError: (error) => {
      avisarError(error);
      qc.invalidateQueries({ queryKey: claves.dependencias(tableroId) });
    },
  });
}

// --- Calendario laboral (administrador del módulo) ------------------------------------------

function trasCambioDeFeriados(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["feriados"] });
  // Los días hábiles cambian el «vence pronto» y las dependencias.
  qc.invalidateQueries({ queryKey: ["tablero"] });
  qc.invalidateQueries({ queryKey: claves.misTareas });
}

export function useCrearFeriado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { fecha: string; nombre: string; recurrente: boolean }) =>
      api.post(`${V1}/calendario/feriados/`, datos),
    onSuccess: () => trasCambioDeFeriados(qc),
    onError: avisarError,
  });
}

export function useEliminarFeriado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`${V1}/calendario/feriados/${id}/`),
    onSuccess: () => trasCambioDeFeriados(qc),
    onError: avisarError,
  });
}

// --- Exportación e importación (fase 4) ------------------------------------------------

/** Filtros del tablero en la forma que entiende `exportar/` (los mismos de la pantalla). */
export type FiltrosExportacion = {
  texto: string;
  urgencias: string[];
  responsables: number[];
  etiquetas: number[];
  soloVencidas: boolean;
};

export function useExportar(tableroId: number) {
  return useMutation({
    mutationFn: ({ formato, filtros }: { formato: FormatoExportacion; filtros?: FiltrosExportacion }) => {
      const params = new URLSearchParams({ formato });
      if (filtros?.texto.trim()) params.set("q", filtros.texto.trim());
      filtros?.urgencias.forEach((u) => params.append("urgencia", u));
      filtros?.responsables.forEach((r) => params.append("responsable", String(r)));
      filtros?.etiquetas.forEach((e) => params.append("etiqueta", String(e)));
      if (filtros?.soloVencidas) params.set("vencidas", "1");
      return descargar(`${V1}/tableros/${tableroId}/exportar/?${params}`, `tablero.${formato}`);
    },
    onError: avisarError,
  });
}

export function useDescargarPlantilla(tableroId: number) {
  return useMutation({
    mutationFn: () => descargar(`${V1}/tableros/${tableroId}/importar/plantilla/`, "plantilla.xlsx"),
    onError: avisarError,
  });
}

function formularioImportacion(archivo: File, confirmar: boolean): FormData {
  const datos = new FormData();
  datos.append("archivo", archivo);
  if (confirmar) datos.append("confirmar", "true");
  return datos;
}

/** Paso 1: lee y valida el archivo sin guardar nada. */
export function useVistaPreviaImportacion(tableroId: number) {
  return useMutation({
    mutationFn: (archivo: File) =>
      api.subir<VistaPrevia>(`${V1}/tableros/${tableroId}/importar/`, formularioImportacion(archivo, false)),
  });
}

/** Paso 2: crea las filas válidas (el servidor vuelve a validar el mismo archivo). */
export function useImportar(tableroId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archivo: File) =>
      api.subir<ResultadoImportacion>(`${V1}/tableros/${tableroId}/importar/`, formularioImportacion(archivo, true)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.tablero(tableroId) });
      qc.invalidateQueries({ queryKey: claves.misTareas });
      qc.invalidateQueries({ queryKey: claves.tableros });
    },
    onError: avisarError,
  });
}
