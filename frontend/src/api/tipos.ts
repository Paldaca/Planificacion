/** Formas de la API `/api/v1/` (backend/tableros y backend/equipos). */

export type Urgencia = "baja" | "media" | "alta" | "critica";
export type Vencimiento = "vencida" | "vence_pronto" | "al_dia" | "terminada" | "sin_fecha";
export type RolEquipo = "administrador" | "miembro" | "lector";

export type Persona = {
  id: number;
  nombre: string;
  username: string;
  email: string;
  iniciales: string;
  disciplina: string | null;
};

export type EquipoBreve = { id: number; nombre: string; color: string };

export type Columna = {
  id: number;
  nombre: string;
  orden: number;
  es_final: boolean;
  incluir_en_gantt: boolean;
  version: number;
};

export type CardResumen = {
  id: number;
  numero: number;
  titulo: string;
  tiene_descripcion: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  urgencia: Urgencia;
  columna: number;
  orden: number;
  en_gantt: "heredar" | "si" | "no";
  responsables: Persona[];
  comentarios: number;
  vencimiento: Vencimiento;
  completada_en: string | null;
  version: number;
  actualizado_en: string;
};

export type CardDetalle = CardResumen & {
  descripcion: string;
  creada_por: Persona | null;
  creado_en: string;
  tablero: { id: number; nombre: string; tipo: TipoTablero; equipo: EquipoBreve | null };
  columna_nombre: string;
  archivada: boolean;
  permisos: { editar: boolean };
};

export type MisTarea = CardResumen & {
  tablero: { id: number; nombre: string; tipo: TipoTablero; equipo: EquipoBreve | null };
  columna_nombre: string;
};

export type TipoTablero = "personal" | "equipo";

export type PermisosTablero = { editar: boolean; gestionar: boolean; archivar: boolean };

export type TableroResumen = {
  id: number;
  nombre: string;
  descripcion: string;
  tipo: TipoTablero;
  equipo: EquipoBreve | null;
  archivado: boolean;
  conteos: { abiertas: number; vencidas: number; terminadas: number };
  permisos: PermisosTablero;
  actualizado_en: string;
};

export type TableroDetalle = TableroResumen & {
  columnas: Columna[];
  cards: CardResumen[];
  personas: Persona[];
  mi_rol: RolEquipo | "propietario" | null;
};

export type Comentario = {
  id: number;
  autor: Persona | null;
  texto: string;
  eliminado: boolean;
  creado_en: string;
  editado_en: string | null;
  es_mio: boolean;
};

export type Equipo = {
  id: number;
  nombre: string;
  descripcion: string;
  color: string;
  archivado: boolean;
  mi_rol: RolEquipo | null;
  miembros: Persona[];
  num_miembros: number;
  num_tableros: number;
  invitaciones_pendientes: number | null;
  permisos: { administrar: boolean };
  creado_en: string;
};

export type Miembro = {
  id: number;
  persona: Persona;
  rol: RolEquipo;
  agregado_por: Persona | null;
  agregado_en: string;
  es_yo: boolean;
};

export type Invitacion = {
  id: number;
  equipo: EquipoBreve & { descripcion: string; num_miembros: number };
  invitado: Persona;
  invitado_por: Persona | null;
  rol: RolEquipo;
  mensaje: string;
  estado: "pendiente" | "aceptada" | "rechazada" | "cancelada";
  creada_en: string;
  respondida_en: string | null;
};
