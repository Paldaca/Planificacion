/** Formas de la API `/api/v1/` (apps tableros, equipos, calendario y gantt). */

export type Urgencia = "baja" | "media" | "alta" | "critica";
export type Vencimiento = "vencida" | "vence_pronto" | "al_dia" | "terminada" | "sin_fecha";
export type RolEquipo = "administrador" | "miembro" | "lector";
export type EnGantt = "heredar" | "si" | "no";
export type Vista = "tablero" | "lista" | "calendario" | "gantt";

export type Persona = {
  id: number;
  nombre: string;
  username: string;
  email: string;
  iniciales: string;
  disciplina: string | null;
};

/** Resultado del buscador de invitados: `id` es la cuenta local (null si la
 *  persona aún no entró al módulo); `portal_id` viene del Portal. */
export type PersonaBuscada = Omit<Persona, "id"> & { id: number | null; portal_id?: number };

export type BusquedaPersonas = { resultados: PersonaBuscada[]; fuente: "portal" | "local" };

export type EquipoBreve = { id: number; nombre: string; color: string };

export type Columna = {
  id: number;
  nombre: string;
  orden: number;
  es_final: boolean;
  incluir_en_gantt: boolean;
  /** Límite suave de tarjetas (fase 5): avisa al pasarse, no bloquea. */
  limite_cards: number | null;
  version: number;
};

/** Etiqueta de un tablero (fase 5). */
export type Etiqueta = { id: number; nombre: string; color: string; orden: number };

export type TipoCampo = "texto" | "numero" | "lista";

/** Campo personalizado de un tablero (fase 5). Archivado: oculto, sus valores se conservan. */
export type CampoPersonalizado = {
  id: number;
  nombre: string;
  tipo: TipoCampo;
  opciones: string[];
  orden: number;
  visible_en_tarjeta: boolean;
  archivado: boolean;
};

/** Valores de los campos personalizados de una tarjeta: { "<id del campo>": valor }. */
export type ValoresCampos = Record<string, string | number>;

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
  en_gantt: EnGantt;
  /** Regla de inclusión ya resuelta por el backend (card o, si hereda, columna). */
  en_gantt_efectivo: boolean;
  /** Ids de las etiquetas del tablero. */
  etiquetas: number[];
  campos: ValoresCampos;
  responsables: Persona[];
  comentarios: number;
  checklist: { hechos: number; total: number };
  vencimiento: Vencimiento;
  completada_en: string | null;
  version: number;
  actualizado_en: string;
};

export type ItemChecklist = {
  id: number;
  texto: string;
  hecho: boolean;
  orden: number;
  hecho_por: Persona | null;
};

export type Actividad = {
  id: number;
  actor: Persona | null;
  accion:
    | "creo"
    | "movio"
    | "edito"
    | "asigno"
    | "desasigno"
    | "comento"
    | "checklist"
    | "archivo"
    | "restauro"
    | "traslado"
    | "dependencia";
  detalle: Record<string, unknown>;
  creado_en: string;
};

export type CardDetalle = CardResumen & {
  descripcion: string;
  items: ItemChecklist[];
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
  etiquetas: Etiqueta[];
  /** Todos los campos, archivados incluidos (para gestionarlos). */
  campos: CampoPersonalizado[];
};

export type Comentario = {
  id: number;
  autor: Persona | null;
  texto: string;
  menciones: Persona[];
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

// --- Calendario laboral y Gantt --------------------------------------------------------

export type Feriado = {
  fecha: string;
  nombre: string;
  tipo: "fijo" | "puntual" | "movil";
  id: number | null;
  /** Móviles (Carnaval, Semana Santa) se calculan: no se editan. */
  editable: boolean;
};

export type TipoDependencia = "fin_inicio" | "inicio_inicio" | "fin_fin";

export type Dependencia = {
  id: number;
  predecesora: number;
  sucesora: number;
  tipo: TipoDependencia;
  desfase_dias: number;
  /** La sucesora empieza (o termina) antes de lo que la dependencia permite. */
  incumplida: boolean;
};

// --- Exportación e importación (fase 4) ------------------------------------------------

export type FormatoExportacion = "xlsx" | "xml";

export type FilaVistaPrevia = {
  fila: number;
  ref: number | null;
  titulo: string;
  columna: string | null;
  urgencia: Urgencia;
  inicio: string | null;
  fin: string | null;
  responsables: string[];
  etiquetas: string[];
  depende: string[];
  /** Con errores la fila no se importa; con avisos, se importa con un ajuste. */
  errores: string[];
  avisos: string[];
};

export type VistaPrevia = {
  filas: FilaVistaPrevia[];
  total: number;
  validas: number;
  con_errores: number;
  dependencias: number;
};

export type ResultadoImportacion = {
  creadas: number;
  omitidas: number;
  dependencias: number;
  avisos: string[];
};

// --- Plantillas (fase 5) -------------------------------------------------------------

export type AlcancePlantilla = "personal" | "equipo" | "global";

export type Plantilla = {
  id: number;
  nombre: string;
  descripcion: string;
  alcance: AlcancePlantilla;
  equipo: EquipoBreve | null;
  creada_por: string | null;
  creada_en: string;
  /** `duracion`: días hábiles de principio a fin (null si no hay fechas). */
  resumen: { columnas: number; tarjetas: number; etiquetas: number; campos: number; duracion: number | null };
  permisos: { gestionar: boolean };
};
