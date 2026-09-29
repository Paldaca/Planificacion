import { ChartGantt, ChevronDown, ChevronsLeftRight, EyeOff, Link2, Locate, Maximize2, Minimize2, Plus } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { useCrearDependencia, useDependencias, useFeriados, useProgramarCard } from "@/api/queries";
import type { CardResumen, Dependencia, TableroDetalle } from "@/api/tipos";
import { NuevaTareaDialogo } from "@/components/tablero/NuevaTareaDialogo";
import { Boton } from "@/components/ui/Boton";
import { Pildora } from "@/components/ui/Estados";
import { BotonCalendarioLaboral } from "@/components/vistas/CalendarioLaboral";
import { useEstable } from "@/hooks/useEstable";
import { usePantallaCompleta } from "@/hooks/usePantallaCompleta";
import { usePreferencia } from "@/hooks/usePreferencia";
import { cn } from "@/lib/cn";
import { aISO, diferencia, sumarDias, sumarDiasISO } from "@/lib/dias";
import { hoy as hoyLocal, parsearDia } from "@/lib/fechas";
import {
  ALTO_FILA,
  ALTO_GRUPO,
  PX_POR_DIA,
  avanceDe,
  cajas,
  calcularRango,
  construirFilas,
  encaje,
  fechaDeX,
  xDeFecha,
  type Agrupacion,
  type Rango,
  type Zoom,
} from "@/lib/gantt";

import { AyudaSucesoras, InterruptorSucesoras } from "./Ayuda";
import { ResumenAvance, ResumenGrupo } from "./Avance";
import { Escala, Fondo } from "./Escala";
import { Barra, EtiquetaCard } from "./Filas";
import { Flechas, PanelDependencia } from "./Dependencias";
import { Bandeja, BotonBandeja } from "./Bandeja";
import { ALTO_ESCALA, type Colocando, type Enlace, type Modo } from "./tipos";

const ZOOMS: { id: Zoom; etiqueta: string }[] = [
  { id: "dia", etiqueta: "Día" },
  { id: "semana", etiqueta: "Semana" },
  { id: "mes", etiqueta: "Mes" },
];

const AGRUPACIONES: { id: Agrupacion; etiqueta: string }[] = [
  { id: "columna", etiqueta: "Columna" },
  { id: "responsable", etiqueta: "Responsable" },
  { id: "urgencia", etiqueta: "Urgencia" },
  { id: "ninguna", etiqueta: "Sin agrupar" },
];

/** Nunca más bajo que esto, aunque la ventana sea pequeña. */
const ALTO_MINIMO = 320;
/** Aire que se deja bajo el Gantt (leyenda y margen): crece, pero no llena todo. */
const MARGEN_INFERIOR = 88;
/** Como mucho se descuenta esta fracción de la ventana por lo que hay encima. */
const MAX_CABECERA = 0.45;

/** Con la bandeja abierta el cuerpo no baja de esto (si no, el panel no cabe). */
const ALTO_CON_BANDEJA = 300;

type Espacio = { ancho: number; alto: number; visible: number };

/**
 * Espacio disponible para el Gantt: el alto que queda en la ventana bajo la
 * cabecera del tablero (menos un margen), el ancho de la línea de tiempo y el
 * alto visible del cuerpo (solo significativo en pantalla completa, donde el
 * cuerpo ocupa lo que sobra). Se vuelve a medir al cambiar el tamaño de la
 * ventana o del contenedor, y con `clave` (el contenedor se vuelve a montar al
 * entrar o salir de pantalla completa).
 */
function useEspacioDisponible(
  contenedor: React.RefObject<HTMLDivElement | null>,
  etiquetas: React.RefObject<HTMLDivElement | null>,
  activo: boolean,
  clave: unknown,
): Espacio {
  const [espacio, setEspacio] = useState<Espacio>({ ancho: 0, alto: 0, visible: 0 });
  useLayoutEffect(() => {
    const el = contenedor.current;
    if (!activo || !el) return;
    const medir = () => {
      const arriba = el.getBoundingClientRect().top + window.scrollY;
      const alto = Math.max(
        ALTO_MINIMO,
        Math.round(window.innerHeight - Math.min(arriba, window.innerHeight * MAX_CABECERA) - MARGEN_INFERIOR),
      );
      const ancho = Math.max(0, el.clientWidth - (etiquetas.current?.offsetWidth ?? 0));
      const visible = el.clientHeight;
      setEspacio((previo) =>
        previo.alto === alto && previo.ancho === ancho && previo.visible === visible ? previo : { alto, ancho, visible },
      );
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [contenedor, etiquetas, activo, clave]);
  return espacio;
}
const MAX_DIAS_FERIADOS = 790;

/** `rango` se congela al empezar: la escala no debe moverse bajo el cursor. */
type Arrastre = { card: CardResumen; modo: Modo; x0: number; delta: number; movido: boolean; rango: Rango };
type Seleccion = { dep: Dependencia; x: number; y: number };

/** Fechas que tendría la tarjeta si se soltara ahora. */
function fechasPrevistas(card: CardResumen, modo: Modo, delta: number): [string, string] {
  const ini = card.fecha_inicio!;
  const fin = card.fecha_fin!;
  if (modo === "mover") return [sumarDiasISO(ini, delta), sumarDiasISO(fin, delta)];
  if (modo === "inicio") {
    const nuevo = sumarDiasISO(ini, delta);
    return [nuevo > fin ? fin : nuevo, fin];
  }
  const nuevo = sumarDiasISO(fin, delta);
  return [ini, nuevo < ini ? ini : nuevo];
}

export function VistaGantt({
  tablero,
  visibles,
  onAbrir,
  onVerAtrasadas,
}: {
  tablero: TableroDetalle;
  visibles: CardResumen[];
  onAbrir: (card: CardResumen) => void;
  /** Filtra el tablero a lo vencido o por vencer (desde el resumen). */
  onVerAtrasadas?: () => void;
}) {
  const [zoom, setZoom] = usePreferencia<Zoom>("gantt:zoom", "dia", ["dia", "semana", "mes"]);
  const [agrupar, setAgrupar] = usePreferencia<Agrupacion>("gantt:agrupar", "columna", [
    "columna",
    "responsable",
    "urgencia",
    "ninguna",
  ]);
  const [moverSucesoras, setMoverSucesoras] = usePreferencia<boolean>("gantt:mover-sucesoras", true);
  const [plegados, setPlegados] = useState<Set<string>>(() => new Set());
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [enlace, setEnlace] = useState<Enlace | null>(null);
  const [colocando, setColocando] = useState<Colocando | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [resaltada, setResaltada] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  /** Predecesora propuesta al crear desde el «+» de una fila. */
  const [despuesDe, setDespuesDe] = useState<number | null>(null);
  const [verBandeja, setVerBandeja] = useState(false);
  /** Tramo al que desplazarse tras «Encajar» (cuando el zoom nuevo ya se pintó). */
  const [encuadre, setEncuadre] = useState<{ desde: string; hasta: string } | null>(null);
  const pantalla = usePantallaCompleta();
  const ultimoScroll = useRef({ left: 0, top: 0 });
  /** Tarjeta recién creada: se lleva a la vista en cuanto tiene barra. */
  const [enfocar, setEnfocar] = useState<number | null>(null);
  const temporizadorResalte = useRef<number | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement>(null);
  const etiquetasRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const puede = tablero.permisos.editar;
  const programar = useProgramarCard(tablero.id);
  const crearDependencia = useCrearDependencia(tablero.id);
  const { data: dependencias = [] } = useDependencias(tablero.id);

  const hoyISO = aISO(hoyLocal());
  const px = PX_POR_DIA[zoom];
  const incluidas = useMemo(() => visibles.filter((c) => c.en_gantt_efectivo), [visibles]);
  const conFechas = useMemo(() => incluidas.filter((c) => c.fecha_inicio && c.fecha_fin), [incluidas]);
  const sinFechas = useMemo(() => incluidas.filter((c) => !(c.fecha_inicio && c.fecha_fin)), [incluidas]);
  const excluidas = visibles.length - incluidas.length;

  const espacio = useEspacioDisponible(scrollRef, etiquetasRef, incluidas.length > 0, pantalla.expandido);
  const diasVisibles = Math.ceil(espacio.ancho / px);
  const rango = useMemo(
    () => calcularRango(conFechas, zoom, parsearDia(hoyISO), diasVisibles),
    [conFechas, zoom, hoyISO, diasVisibles],
  );
  const r = arrastre?.rango ?? rango;
  const ancho = r.dias * px;

  const hastaFeriados = diferencia(r.desde, r.hasta) > MAX_DIAS_FERIADOS ? sumarDias(r.desde, MAX_DIAS_FERIADOS) : r.hasta;
  const { data: feriados } = useFeriados(aISO(r.desde), aISO(hastaFeriados));
  const feriadosPorDia = useMemo(() => new Map((feriados ?? []).map((f) => [f.fecha, f.nombre])), [feriados]);

  // Las tarjetas se dibujan con las fechas previstas mientras se arrastran.
  const mostradas = useMemo(() => {
    if (!arrastre?.movido) return conFechas;
    const [ini, fin] = fechasPrevistas(arrastre.card, arrastre.modo, arrastre.delta);
    return conFechas.map((c) => (c.id === arrastre.card.id ? { ...c, fecha_inicio: ini, fecha_fin: fin } : c));
  }, [conFechas, arrastre]);

  const { filas, alto } = useMemo(
    () => construirFilas(mostradas, agrupar, tablero.columnas, plegados),
    [mostradas, agrupar, tablero.columnas, plegados],
  );
  const posiciones = useMemo(() => cajas(filas, r, px), [filas, r, px]);
  // En pantalla completa el fondo (días, feriados) llena todo el alto.
  const altoCuerpo = Math.max(
    alto,
    ALTO_FILA * 3,
    sinFechas.length > 0 && verBandeja ? ALTO_CON_BANDEJA : 0,
    pantalla.expandido ? espacio.visible - ALTO_ESCALA : 0,
  );

  // Al entrar, la línea de hoy y las tarjetas en curso quedan a la vista; al
  // cambiar el zoom solo se recoloca en horizontal (no se pierde la fila).
  const hayBarras = conFechas.length > 0;
  const centradoVertical = useRef(false);
  const centrarHoy = useEffectEvent(() => {
    irAHoy("auto", !centradoVertical.current);
    centradoVertical.current = true;
  });
  useLayoutEffect(() => {
    centrarHoy();
  }, [zoom, hayBarras]);

  /** Hoy en horizontal y, con `vertical`, la primera tarjeta que sigue abierta
   * hoy: sin esto, en un tablero largo se abría sobre filas ya terminadas y
   * sin ninguna barra a la vista. */
  function irAHoy(comportamiento: ScrollBehavior = "smooth", vertical = true) {
    const el = scrollRef.current;
    if (!el) return;
    const x = xDeFecha(hoyISO, r, px);
    const vigente = vertical
      ? filas.find((f) => f.tipo === "card" && f.card.fecha_fin !== null && f.card.fecha_fin >= hoyISO)
      : undefined;
    // La columna de títulos es fija y tapa la izquierda: cuenta solo lo visible.
    const visible = el.clientWidth - (etiquetasRef.current?.offsetWidth ?? 0);
    el.scrollTo({
      left: Math.max(0, x - visible * 0.3),
      top: vigente ? Math.max(0, vigente.y - ALTO_FILA) : el.scrollTop,
      behavior: comportamiento,
    });
  }

  useLayoutEffect(() => {
    if (enfocar === null) return;
    const caja = posiciones.get(enfocar);
    const el = scrollRef.current;
    if (!caja || !el) return;
    const visible = el.clientWidth - (etiquetasRef.current?.offsetWidth ?? 0);
    el.scrollTo({ left: Math.max(0, caja.x1 - visible * 0.25), top: Math.max(0, caja.y - ALTO_FILA * 2), behavior: "smooth" });
    const id = enfocar;
    setResaltada(id);
    setEnfocar(null);
    // En una ref: si el temporizador dependiera del efecto, al poner `enfocar`
    // a null se cancelaría y la fila quedaría resaltada.
    window.clearTimeout(temporizadorResalte.current);
    temporizadorResalte.current = window.setTimeout(() => setResaltada((r) => (r === id ? null : r)), 2500);
  }, [enfocar, posiciones]);
  useEffect(() => () => window.clearTimeout(temporizadorResalte.current), []);

  // Tras «Encajar»: centra el tramo con el zoom nuevo (va después del efecto
  // que centra hoy al cambiar el zoom, para ganarle).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!encuadre || !el) return;
    const x1 = xDeFecha(encuadre.desde, r, px);
    const x2 = xDeFecha(encuadre.hasta, r, px) + px;
    const visible = el.clientWidth - (etiquetasRef.current?.offsetWidth ?? 0);
    el.scrollTo({ left: Math.max(0, x1 - Math.max(0, visible - (x2 - x1)) / 2), top: 0, behavior: "smooth" });
    setEncuadre(null);
  }, [encuadre, r, px]);

  // Al entrar o salir de pantalla completa el cuerpo se vuelve a montar: se
  // recupera el desplazamiento. Se repite al medir el espacio nuevo (re-render
  // síncrono, antes de pintar), cuando la línea de tiempo ya tiene su ancho.
  const expandidoPrevio = useRef(pantalla.expandido);
  const restaurar = useRef<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (expandidoPrevio.current !== pantalla.expandido) {
      expandidoPrevio.current = pantalla.expandido;
      restaurar.current = { ...ultimoScroll.current };
      window.setTimeout(() => (restaurar.current = null), 0);
    }
    if (restaurar.current) scrollRef.current?.scrollTo(restaurar.current);
  }, [pantalla.expandido, espacio.ancho]);

  /** Zoom y posición para ver todas las barras visibles de una vez. */
  function encajar() {
    const { desde, hasta } = avanceDe(conFechas);
    if (!desde || !hasta) return;
    const e = encaje(desde, hasta, espacio.ancho);
    setZoom(e.zoom);
    setEncuadre({ desde: e.desde, hasta: e.hasta });
  }

  const avance = useMemo(() => avanceDe(incluidas), [incluidas]);
  const porVencer = useMemo(() => incluidas.filter((c) => c.vencimiento === "vence_pronto").length, [incluidas]);

  const dialogoNueva = puede && (
    <NuevaTareaDialogo
      tablero={tablero}
      abierto={creando}
      despuesDe={despuesDe}
      onCerrar={() => setCreando(false)}
      onCreada={(card) => setEnfocar(card.id)}
    />
  );
  const botonNueva = puede && (
    <Boton
      tamano="sm"
      onClick={() => {
        setDespuesDe(null);
        setCreando(true);
      }}
    >
      <Plus />
      Tarea
    </Boton>
  );

  function alternarGrupo(clave: string) {
    setPlegados((p) => {
      const n = new Set(p);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  }

  function puntoEnArea(clientX: number, clientY: number) {
    const rect = areaRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top, dentro: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom };
  }

  // --- Barras: mover o estirar --------------------------------------------------------

  function empezarArrastre(e: ReactPointerEvent, card: CardResumen, modo: Modo) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSeleccion(null);
    setArrastre({ card, modo, x0: e.clientX, delta: 0, movido: false, rango });
  }

  function moverArrastre(e: ReactPointerEvent) {
    if (!arrastre) return;
    const movido = arrastre.movido || Math.abs(e.clientX - arrastre.x0) > 4;
    if (!movido || !puede) return;
    const delta = Math.round((e.clientX - arrastre.x0) / px);
    if (delta !== arrastre.delta || movido !== arrastre.movido) setArrastre({ ...arrastre, movido, delta });
  }

  /** En táctil deslizar sobre una barra desplaza el Gantt: el navegador cancela
   * el puntero y no debe quedar un arrastre a medias (ni abrirse la tarjeta). */
  function cancelarArrastre() {
    setArrastre(null);
  }

  function soltarArrastre() {
    const a = arrastre;
    setArrastre(null);
    if (!a) return;
    if (!a.movido) {
      onAbrir(a.card);
      return;
    }
    const [inicio, fin] = fechasPrevistas(a.card, a.modo, a.delta);
    if (inicio === a.card.fecha_inicio && fin === a.card.fecha_fin) return;
    programar.mutate({ card: a.card, inicio, fin, moverSucesoras });
  }

  // --- Enlazar dos tarjetas (arrastrar desde el conector) ----------------------------

  function empezarEnlace(e: ReactPointerEvent, card: CardResumen) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = puntoEnArea(e.clientX, e.clientY);
    setEnlace({ desde: card.id, x: p.x, y: p.y });
  }

  function moverEnlace(e: ReactPointerEvent) {
    if (!enlace) return;
    const p = puntoEnArea(e.clientX, e.clientY);
    setEnlace({ ...enlace, x: p.x, y: p.y });
  }

  function soltarEnlace(e: ReactPointerEvent) {
    const actual = enlace;
    setEnlace(null);
    if (!actual) return;
    const destino = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((n): n is HTMLElement => n instanceof HTMLElement && Boolean(n.dataset.cardId));
    const sucesora = destino ? Number(destino.dataset.cardId) : null;
    if (sucesora && sucesora !== actual.desde) {
      crearDependencia.mutate({ predecesora: actual.desde, sucesora });
    }
  }

  // --- Bandeja «sin fechas»: soltar sobre la línea de tiempo -------------------------

  function empezarColocar(e: ReactPointerEvent, card: CardResumen) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setColocando({ card, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, movido: false });
  }

  function moverColocar(e: ReactPointerEvent) {
    if (!colocando) return;
    const movido = colocando.movido || Math.hypot(e.clientX - colocando.x0, e.clientY - colocando.y0) > 5;
    setColocando({ ...colocando, x: e.clientX, y: e.clientY, movido: movido && puede });
  }

  function soltarColocar(e: ReactPointerEvent) {
    const c = colocando;
    setColocando(null);
    if (!c) return;
    if (!c.movido) {
      onAbrir(c.card);
      return;
    }
    const p = puntoEnArea(e.clientX, e.clientY);
    if (!p.dentro) return;
    const dia = fechaDeX(p.x, r, px);
    // Conserva la fecha que ya tenga si sigue siendo coherente; si no, un día.
    const fin = c.card.fecha_fin && c.card.fecha_fin >= dia ? c.card.fecha_fin : dia;
    programar.mutate({ card: c.card, inicio: dia, fin, moverSucesoras });
  }

  // Identidad estable: así resaltar una fila o arrastrar una barra no vuelve a
  // pintar las demás (con cientos de tarjetas, cada render completo se notaba).
  const alEmpezarArrastre = useEstable(empezarArrastre);
  const alMoverArrastre = useEstable(moverArrastre);
  const alSoltarArrastre = useEstable(soltarArrastre);
  const alCancelarArrastre = useEstable(cancelarArrastre);
  const alEmpezarEnlace = useEstable(empezarEnlace);
  const alMoverEnlace = useEstable(moverEnlace);
  const alSoltarEnlace = useEstable(soltarEnlace);
  const alAbrir = useEstable(onAbrir);
  const alNuevaSucesora = useEstable((card: CardResumen) => {
    setDespuesDe(card.id);
    setCreando(true);
  });

  const diaColocando = useMemo(() => {
    if (!colocando?.movido || !areaRef.current) return null;
    const p = puntoEnArea(colocando.x, colocando.y);
    return p.dentro ? fechaDeX(p.x, r, px) : null;
  }, [colocando, r, px]);

  const cardsPorId = useMemo(() => new Map(conFechas.map((c) => [c.id, c])), [conFechas]);
  // La versión vigente (tras editarla o si otra persona la quitó).
  const seleccionVigente = seleccion ? dependencias.find((d) => d.id === seleccion.dep.id) : undefined;

  if (!incluidas.length) {
    return (
      <div className="animate-rise rounded-2xl border border-dashed border-linea bg-white/60 px-6 py-14 text-center">
        <ChartGantt className="mx-auto mb-3 size-8 text-tenue/50" />
        <p className="font-display font-semibold text-marino">Nada que mostrar en el Gantt</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-tenue">
          {visibles.length
            ? "Las tarjetas visibles están fuera del Gantt. Actívalo desde el menú de una columna («Incluir en el Gantt») o desde cada tarjeta."
            : tablero.cards.length
              ? "Ninguna tarjeta coincide con los filtros."
              : "Crea tareas con fecha de inicio y fin para verlas en la línea de tiempo."}
        </p>
        {botonNueva && <div className="mt-4 flex justify-center">{botonNueva}</div>}
        {dialogoNueva}
      </div>
    );
  }

  const xHoy = xDeFecha(hoyISO, r, px) + px / 2;

  const expandido = pantalla.expandido;
  const contenido = (
    // En pantalla completa va en un portal a <body>: un ancestro con `transform`
    // (las animaciones de entrada) rompería el `fixed`.
    <div className={cn(expandido ? "fixed inset-0 z-50 flex flex-col bg-fondo p-2 sm:p-3" : "animate-rise")}>
      <div
        className={cn(
          "min-w-0 overflow-hidden rounded-2xl border border-linea bg-white shadow-[0_18px_40px_-32px_rgba(20,22,68,0.45)]",
          expandido && "flex min-h-0 flex-1 flex-col",
        )}
      >
        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-2 border-b border-linea px-3 py-2.5">
          {botonNueva}
          <div className="flex items-center gap-0.5 rounded-lg bg-fondo p-0.5" role="radiogroup" aria-label="Zoom">
            {ZOOMS.map((z) => (
              <button
                key={z.id}
                type="button"
                role="radio"
                aria-checked={zoom === z.id}
                onClick={() => setZoom(z.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                  zoom === z.id ? "bg-white text-morado shadow-sm" : "text-tenue hover:text-morado",
                )}
              >
                {z.etiqueta}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-tenue">
            Agrupar
            <select
              value={agrupar}
              onChange={(e) => {
                setPlegados(new Set());
                setAgrupar(e.target.value as Agrupacion);
              }}
              className="h-8 rounded-lg border border-linea bg-white px-2 text-xs font-semibold text-texto outline-none focus:border-morado"
            >
              {AGRUPACIONES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            {puede && <InterruptorSucesoras activo={moverSucesoras} onCambiar={setMoverSucesoras} />}
            <AyudaSucesoras puede={puede} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {excluidas > 0 && (
              <Pildora icono={EyeOff} className="cursor-help">
                <span title="Por su columna o por la opción «Gantt» de cada tarjeta">{excluidas} fuera del Gantt</span>
              </Pildora>
            )}
            {sinFechas.length > 0 && (
              <BotonBandeja total={sinFechas.length} abierta={verBandeja} onAlternar={() => setVerBandeja((v) => !v)} />
            )}
            {/* En el teléfono, solo iconos: la barra no ocupa media pantalla. */}
            <Boton variante="secundario" tamano="sm" onClick={() => irAHoy()} aria-label="Hoy" className="max-sm:px-2.5">
              <Locate />
              <span className="max-sm:hidden">Hoy</span>
            </Boton>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={encajar}
              aria-label="Encajar"
              title="Ajusta el zoom para ver todas las tareas de una vez"
              className="max-sm:px-2.5"
            >
              <ChevronsLeftRight />
              <span className="max-sm:hidden">Encajar</span>
            </Boton>
            <BotonCalendarioLaboral />
            <Boton
              variante={expandido ? "primario" : "secundario"}
              tamano="icono-sm"
              onClick={pantalla.alternar}
              aria-label={expandido ? "Salir de pantalla completa" : "Pantalla completa"}
              title={expandido ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
            >
              {expandido ? <Minimize2 /> : <Maximize2 />}
            </Boton>
          </div>
        </div>

        <ResumenAvance
          avance={avance}
          porVencer={porVencer}
          sinFechas={sinFechas.length}
          onVerAtrasadas={onVerAtrasadas}
          onVerSinFechas={() => setVerBandeja(true)}
        />

        {/* Cuerpo desplazable: etiquetas fijas a la izquierda, escala fija arriba */}
        <div className={cn("relative", expandido && "flex min-h-0 flex-1 flex-col")}>
          <div
            ref={scrollRef}
            onScroll={(e) => {
              ultimoScroll.current = { left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop };
            }}
            className={cn(
              "relative overflow-auto overscroll-contain",
              expandido ? "min-h-0 flex-1" : !espacio.alto && "max-h-[68vh]",
            )}
            style={!expandido && espacio.alto ? { maxHeight: espacio.alto } : undefined}
          >
            <div className="flex min-w-max">
              {/* Columna de etiquetas */}
              <div ref={etiquetasRef} className="sticky left-0 z-30 w-32 shrink-0 border-r border-linea bg-white sm:w-60 2xl:w-72">
                <div
                  className="sticky top-0 z-10 flex items-end border-b border-linea bg-fondo px-3 pb-2 text-[0.7rem] font-bold tracking-[0.08em] text-tenue uppercase"
                  style={{ height: ALTO_ESCALA }}
                >
                  Tarjeta
                </div>
                <div className="relative" style={{ height: altoCuerpo }}>
                  {filas.map((f) =>
                    f.tipo === "grupo" ? (
                      <button
                        key={`g-${f.clave}`}
                        type="button"
                        onClick={() => alternarGrupo(f.clave)}
                        className="absolute inset-x-0 flex items-center gap-2 border-b border-linea/70 bg-fondo/70 px-3 text-left text-xs font-bold text-marino transition-colors hover:bg-columna"
                        style={{ top: f.y, height: ALTO_GRUPO }}
                      >
                        <ChevronDown className={cn("size-3.5 text-tenue transition-transform", plegados.has(f.clave) && "-rotate-90")} />
                        <span className="size-2 rounded-full" style={{ background: f.color }} />
                        <span className="truncate">{f.titulo}</span>
                        {f.vencidas > 0 && (
                          <span
                            className="ml-auto rounded-full bg-[#fef2f2] px-1.5 text-[0.68rem] font-bold text-[#dc2626] tabular-nums"
                            title={f.vencidas === 1 ? "1 vencida" : `${f.vencidas} vencidas`}
                          >
                            {f.vencidas}
                          </span>
                        )}
                        <span
                          className={cn("font-semibold text-tenue tabular-nums", !f.vencidas && "ml-auto")}
                          title={`${f.hechas} de ${f.total} terminadas`}
                        >
                          {f.hechas}/{f.total}
                        </span>
                      </button>
                    ) : (
                      <EtiquetaCard
                        key={f.card.id}
                        fila={f}
                        onAbrir={alAbrir}
                        resaltada={resaltada === f.card.id}
                        onResaltar={setResaltada}
                        onNuevaSucesora={puede ? alNuevaSucesora : undefined}
                      />
                    ),
                  )}
                </div>
              </div>

              {/* Línea de tiempo */}
              <div className="relative shrink-0" style={{ width: ancho }}>
                <Escala rango={r} px={px} zoom={zoom} feriados={feriadosPorDia} xHoy={xHoy} />
                <div
                  ref={areaRef}
                  className={cn("relative", (arrastre?.movido || enlace) && "cursor-grabbing select-none")}
                  style={{ height: altoCuerpo }}
                  onPointerDown={() => setSeleccion(null)}
                >
                  <Fondo rango={r} px={px} feriados={feriadosPorDia} filas={filas} alto={altoCuerpo} />
                  {filas.map((f) =>
                    f.tipo === "grupo" && f.desde && f.hasta ? <ResumenGrupo key={`r-${f.clave}`} fila={f} rango={r} px={px} /> : null,
                  )}
                  {diaColocando && (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-[2] bg-morado/12 ring-1 ring-morado/40 ring-inset"
                      style={{ left: xDeFecha(diaColocando, r, px), width: px }}
                    />
                  )}
                  <div className="pointer-events-none absolute inset-y-0 z-[3] w-0.5 -translate-x-1/2 bg-rojo/70" style={{ left: xHoy }} />

                  <Flechas
                    dependencias={dependencias}
                    posiciones={posiciones}
                    ancho={ancho}
                    alto={altoCuerpo}
                    resaltada={resaltada}
                    seleccionada={seleccion?.dep.id ?? null}
                    onSeleccionar={(dep, e) => {
                      const p = puntoEnArea(e.clientX, e.clientY);
                      setSeleccion({ dep, x: p.x, y: p.y });
                    }}
                    enlace={enlace}
                    origenEnlace={enlace ? posiciones.get(enlace.desde) : undefined}
                  />

                  {filas.map((f) =>
                    f.tipo === "card" && posiciones.has(f.card.id) ? (
                      <Barra
                        key={f.card.id}
                        fila={f}
                        caja={posiciones.get(f.card.id)!}
                        puede={puede}
                        arrastrando={arrastre?.movido === true && arrastre.card.id === f.card.id}
                        destinoEnlace={enlace !== null && enlace.desde !== f.card.id}
                        onPointerDown={alEmpezarArrastre}
                        onPointerMove={alMoverArrastre}
                        onPointerUp={alSoltarArrastre}
                        onPointerCancel={alCancelarArrastre}
                        onConector={alEmpezarEnlace}
                        onConectorMove={alMoverEnlace}
                        onConectorUp={alSoltarEnlace}
                        onResaltar={setResaltada}
                        onAbrir={alAbrir}
                      />
                    ) : null,
                  )}

                  {seleccionVigente && seleccion && (
                    <PanelDependencia
                      key={seleccionVigente.id}
                      tableroId={tablero.id}
                      dep={seleccionVigente}
                      x={seleccion.x}
                      y={seleccion.y}
                      predecesora={cardsPorId.get(seleccionVigente.predecesora)}
                      sucesora={cardsPorId.get(seleccionVigente.sucesora)}
                      puede={puede}
                      onCerrar={() => setSeleccion(null)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
          {sinFechas.length > 0 && verBandeja && (
            <Bandeja
              cards={sinFechas}
              puede={puede}
              colocando={colocando}
              onCerrar={() => setVerBandeja(false)}
              onPointerDown={empezarColocar}
              onPointerMove={moverColocar}
              onPointerUp={soltarColocar}
              onPointerCancel={() => setColocando(null)}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-linea/70 px-4 py-2 text-xs text-tenue">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-rojo/70" /> Hoy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-rojo/10" /> Feriado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            Dependencia incumplida
          </span>
          {puede && (
            <span className="inline-flex items-center gap-1.5 pointer-coarse:hidden">
              <Link2 className="size-3.5" /> Arrastra desde el punto al final de una barra hasta otra para enlazarlas
            </span>
          )}
        </div>
      </div>

      {dialogoNueva}
    </div>
  );
  return expandido ? createPortal(contenido, document.body) : contenido;
}
