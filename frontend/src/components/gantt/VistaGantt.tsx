import { ChartGantt, ChevronDown, CircleCheck, EyeOff, Link2, Locate, Minus, Plus, Trash2, Waypoints } from "lucide-react";
import { Popover } from "radix-ui";
import {
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  useCrearDependencia,
  useDependencias,
  useEditarDependencia,
  useEliminarDependencia,
  useFeriados,
  useProgramarCard,
} from "@/api/queries";
import type { CardResumen, Dependencia, TableroDetalle, TipoDependencia } from "@/api/tipos";
import { PilaAvatares } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Pildora } from "@/components/ui/Estados";
import { BotonCalendarioLaboral } from "@/components/vistas/CalendarioLaboral";
import { usePreferencia } from "@/hooks/usePreferencia";
import { cn } from "@/lib/cn";
import { MESES_LARGOS, aISO, diferencia, esFinDeSemana, inicioMes, sumarDias, sumarDiasISO } from "@/lib/dias";
import { URGENCIAS } from "@/lib/estilos";
import { hoy as hoyLocal, parsearDia, rangoCorto } from "@/lib/fechas";
import {
  ALTO_BARRA,
  ALTO_FILA,
  ALTO_GRUPO,
  ETIQUETAS_TIPO,
  PX_POR_DIA,
  cajas,
  calcularRango,
  construirFilas,
  fechaDeX,
  rutaFlecha,
  xDeFecha,
  type Agrupacion,
  type Fila,
  type Zoom,
} from "@/lib/gantt";

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

const ALTO_ESCALA = 52;
const MAX_DIAS_FERIADOS = 790;

type Modo = "mover" | "inicio" | "fin";
type Rango = ReturnType<typeof calcularRango>;
/** `rango` se congela al empezar: la escala no debe moverse bajo el cursor. */
type Arrastre = { card: CardResumen; modo: Modo; x0: number; delta: number; movido: boolean; rango: Rango };
type Enlace = { desde: number; x: number; y: number };
type Colocando = { card: CardResumen; x: number; y: number; movido: boolean; x0: number; y0: number };
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
}: {
  tablero: TableroDetalle;
  visibles: CardResumen[];
  onAbrir: (card: CardResumen) => void;
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

  const scrollRef = useRef<HTMLDivElement>(null);
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

  const rango = useMemo(() => calcularRango(conFechas, zoom, parsearDia(hoyISO)), [conFechas, zoom, hoyISO]);
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
  const altoCuerpo = Math.max(alto, ALTO_FILA * 3);

  // Al entrar (y al cambiar el zoom), la línea de hoy queda a la vista.
  const centrarHoy = useEffectEvent(() => irAHoy("auto"));
  useLayoutEffect(() => {
    centrarHoy();
  }, [zoom]);

  function irAHoy(comportamiento: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (!el) return;
    const x = xDeFecha(hoyISO, r, px);
    el.scrollTo({ left: Math.max(0, x - el.clientWidth * 0.3), behavior: comportamiento });
  }

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

  const diaColocando = useMemo(() => {
    if (!colocando?.movido || !areaRef.current) return null;
    const p = puntoEnArea(colocando.x, colocando.y);
    return p.dentro ? fechaDeX(p.x, r, px) : null;
  }, [colocando, r, px]);

  const cardsPorId = useMemo(() => new Map(conFechas.map((c) => [c.id, c])), [conFechas]);

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
              : "Crea tarjetas con fecha de inicio y fin para verlas en la línea de tiempo."}
        </p>
      </div>
    );
  }

  const xHoy = xDeFecha(hoyISO, r, px) + px / 2;

  return (
    <div className="animate-rise grid gap-4 lg:grid-cols-[minmax(0,1fr)_248px]">
      <div className="min-w-0 overflow-hidden rounded-2xl border border-linea bg-white shadow-[0_18px_40px_-32px_rgba(20,22,68,0.45)]">
        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-2 border-b border-linea px-3 py-2.5">
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
          {puede && (
            <button
              type="button"
              role="switch"
              aria-checked={moverSucesoras}
              onClick={() => setMoverSucesoras(!moverSucesoras)}
              title="Al retrasar una tarjeta, empuja las que dependen de ella (en días hábiles)"
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-tenue transition-colors hover:bg-fondo"
            >
              <span className={cn("relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors", moverSucesoras ? "bg-morado" : "bg-linea")}>
                <span className={cn("absolute size-3.5 rounded-full bg-white shadow transition-transform duration-200", moverSucesoras ? "translate-x-4" : "translate-x-0.5")} />
              </span>
              Mover sucesoras
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {excluidas > 0 && (
              <Pildora icono={EyeOff} className="cursor-help">
                <span title="Por su columna o por la opción «Gantt» de cada tarjeta">{excluidas} fuera del Gantt</span>
              </Pildora>
            )}
            <Boton variante="secundario" tamano="sm" onClick={() => irAHoy()}>
              <Locate />
              Hoy
            </Boton>
            <BotonCalendarioLaboral />
          </div>
        </div>

        {/* Cuerpo desplazable: etiquetas fijas a la izquierda, escala fija arriba */}
        <div ref={scrollRef} className="relative max-h-[68vh] overflow-auto overscroll-contain">
          <div className="flex min-w-max">
            {/* Columna de etiquetas */}
            <div className="sticky left-0 z-30 w-40 shrink-0 border-r border-linea bg-white sm:w-60">
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
                      <span className="ml-auto font-semibold text-tenue tabular-nums">{f.total}</span>
                    </button>
                  ) : (
                    <EtiquetaCard key={f.card.id} fila={f} onAbrir={onAbrir} resaltada={resaltada === f.card.id} onResaltar={setResaltada} />
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
                      onPointerDown={empezarArrastre}
                      onPointerMove={moverArrastre}
                      onPointerUp={soltarArrastre}
                      onConector={empezarEnlace}
                      onConectorMove={moverEnlace}
                      onConectorUp={soltarEnlace}
                      onResaltar={setResaltada}
                      onAbrir={onAbrir}
                    />
                  ) : null,
                )}

                {seleccion && (
                  <PanelDependencia
                    key={seleccion.dep.id}
                    tableroId={tablero.id}
                    seleccion={seleccion}
                    predecesora={cardsPorId.get(seleccion.dep.predecesora)}
                    sucesora={cardsPorId.get(seleccion.dep.sucesora)}
                    puede={puede}
                    onCerrar={() => setSeleccion(null)}
                  />
                )}
              </div>
            </div>
          </div>
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
            <span className="inline-flex items-center gap-1.5">
              <Link2 className="size-3.5" /> Arrastra desde el punto al final de una barra hasta otra para enlazarlas
            </span>
          )}
        </div>
      </div>

      <Bandeja
        cards={sinFechas}
        puede={puede}
        colocando={colocando}
        onPointerDown={empezarColocar}
        onPointerMove={moverColocar}
        onPointerUp={soltarColocar}
      />
    </div>
  );
}

// --- Escala y fondo -------------------------------------------------------------------------

function Escala({
  rango,
  px,
  zoom,
  feriados,
  xHoy,
}: {
  rango: Rango;
  px: number;
  zoom: Zoom;
  feriados: Map<string, string>;
  xHoy: number;
}) {
  const meses: { x: number; ancho: number; etiqueta: string }[] = [];
  let m = inicioMes(rango.desde);
  while (m <= rango.hasta) {
    const siguiente = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const x = Math.max(0, diferencia(rango.desde, m)) * px;
    const x2 = Math.min(rango.dias, diferencia(rango.desde, siguiente)) * px;
    meses.push({ x, ancho: x2 - x, etiqueta: `${MESES_LARGOS[m.getMonth()]} ${m.getFullYear()}` });
    m = siguiente;
  }
  const dias = Array.from({ length: rango.dias }, (_, i) => sumarDias(rango.desde, i));

  return (
    <div className="sticky top-0 z-20 border-b border-linea bg-fondo" style={{ height: ALTO_ESCALA }}>
      <div className="relative h-6 border-b border-linea/60">
        {meses.map((mes) => (
          <div
            key={mes.etiqueta}
            className="absolute top-0 flex h-full items-center overflow-clip border-l border-linea/80 px-2 text-[0.7rem] font-bold text-marino capitalize"
            style={{ left: mes.x, width: mes.ancho }}
          >
            <span className="sticky left-[168px] truncate sm:left-[248px]">{mes.etiqueta}</span>
          </div>
        ))}
      </div>
      <div className="relative" style={{ height: ALTO_ESCALA - 24 }}>
        {zoom === "dia" &&
          dias.map((d, i) => {
            const iso = aISO(d);
            const feriado = feriados.get(iso);
            return (
              <div
                key={iso}
                title={feriado}
                className={cn(
                  "absolute top-0 flex h-full flex-col items-center justify-center text-[0.62rem] leading-tight tabular-nums",
                  feriado ? "text-rojo" : esFinDeSemana(d) ? "text-tenue/50" : "text-tenue",
                )}
                style={{ left: i * px, width: px }}
              >
                <span className="font-semibold">{d.getDate()}</span>
                <span className="uppercase">{"dlmmjvs"[d.getDay()]}</span>
              </div>
            );
          })}
        {zoom === "semana" &&
          dias.map((d, i) =>
            d.getDay() === 1 ? (
              <div
                key={aISO(d)}
                className="absolute top-0 flex h-full items-center border-l border-linea/70 pl-1 text-[0.62rem] font-semibold text-tenue tabular-nums"
                style={{ left: i * px, width: px * 7 }}
              >
                {d.getDate()}
              </div>
            ) : null,
          )}
        {zoom === "mes" &&
          dias.map((d, i) =>
            d.getDay() === 1 ? (
              <div key={aISO(d)} className="absolute bottom-0 h-2 border-l border-linea" style={{ left: i * px }} />
            ) : null,
          )}
        <span
          className="absolute top-0.5 z-10 -translate-x-1/2 rounded-full bg-rojo px-1.5 py-px text-[0.58rem] font-bold text-white shadow-sm"
          style={{ left: xHoy }}
        >
          HOY
        </span>
      </div>
    </div>
  );
}

function Fondo({
  rango,
  px,
  feriados,
  filas,
  alto,
}: {
  rango: Rango;
  px: number;
  feriados: Map<string, string>;
  filas: Fila[];
  alto: number;
}) {
  const franjas: { x: number; feriado: boolean }[] = [];
  for (let i = 0; i < rango.dias; i += 1) {
    const d = sumarDias(rango.desde, i);
    const feriado = feriados.has(aISO(d));
    if (feriado || esFinDeSemana(d)) franjas.push({ x: i * px, feriado });
  }
  return (
    <div className="pointer-events-none absolute inset-0" style={{ height: alto }}>
      {franjas.map((f) => (
        <div
          key={f.x}
          className={cn("absolute inset-y-0", f.feriado ? "bg-rojo/[0.07]" : "bg-fondo")}
          style={{ left: f.x, width: px }}
        />
      ))}
      {filas.map((f) =>
        f.tipo === "grupo" ? (
          <div key={`g-${f.clave}`} className="absolute inset-x-0 border-b border-linea/70 bg-fondo/60" style={{ top: f.y, height: ALTO_GRUPO }} />
        ) : (
          <div key={f.card.id} className="absolute inset-x-0 border-b border-linea/40" style={{ top: f.y, height: ALTO_FILA }} />
        ),
      )}
    </div>
  );
}

// --- Filas y barras -------------------------------------------------------------------------

function EtiquetaCard({
  fila,
  onAbrir,
  resaltada,
  onResaltar,
}: {
  fila: Extract<Fila, { tipo: "card" }>;
  onAbrir: (c: CardResumen) => void;
  resaltada: boolean;
  onResaltar: (id: number | null) => void;
}) {
  const { card } = fila;
  const terminada = card.vencimiento === "terminada";
  return (
    <button
      type="button"
      onClick={() => onAbrir(card)}
      onPointerEnter={() => onResaltar(card.id)}
      onPointerLeave={() => onResaltar(null)}
      className={cn(
        "absolute inset-x-0 flex items-center gap-2 border-b border-linea/40 px-3 text-left transition-colors",
        resaltada ? "bg-morado/[0.06]" : "hover:bg-morado/[0.04]",
      )}
      style={{ top: fila.y, height: ALTO_FILA }}
    >
      <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: URGENCIAS[card.urgencia].color }} />
      {terminada && <CircleCheck className="size-3.5 shrink-0 text-[#059669]" />}
      <span className={cn("min-w-0 flex-1 truncate text-[0.82rem] font-medium text-texto", terminada && "text-tenue line-through decoration-tenue/40")}>
        {card.titulo}
      </span>
      <span className="hidden sm:block">
        <PilaAvatares personas={card.responsables} max={2} />
      </span>
    </button>
  );
}

function Barra({
  fila,
  caja,
  puede,
  arrastrando,
  destinoEnlace,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onConector,
  onConectorMove,
  onConectorUp,
  onResaltar,
  onAbrir,
}: {
  fila: Extract<Fila, { tipo: "card" }>;
  caja: { x1: number; x2: number; y: number };
  puede: boolean;
  arrastrando: boolean;
  destinoEnlace: boolean;
  onPointerDown: (e: ReactPointerEvent, card: CardResumen, modo: Modo) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onConector: (e: ReactPointerEvent, card: CardResumen) => void;
  onConectorMove: (e: ReactPointerEvent) => void;
  onConectorUp: (e: ReactPointerEvent) => void;
  onResaltar: (id: number | null) => void;
  onAbrir: (c: CardResumen) => void;
}) {
  const { card } = fila;
  const color = URGENCIAS[card.urgencia].color;
  const terminada = card.vencimiento === "terminada";
  const vencida = card.vencimiento === "vencida";
  const ancho = Math.max(caja.x2 - caja.x1 - 4, 8);
  const cabeTitulo = ancho > 70;
  const avance = card.checklist.total ? card.checklist.hechos / card.checklist.total : terminada ? 1 : 0;
  const base = terminada ? "#059669" : color;

  return (
    <div
      className="group absolute z-[6]"
      style={{
        left: caja.x1 + 2,
        top: fila.y + (ALTO_FILA - ALTO_BARRA) / 2,
        width: ancho,
        height: ALTO_BARRA,
        transition: arrastrando ? "none" : "left 0.35s cubic-bezier(0.22,1,0.36,1), width 0.35s cubic-bezier(0.22,1,0.36,1)",
      }}
      onPointerEnter={() => onResaltar(card.id)}
      onPointerLeave={() => onResaltar(null)}
    >
      <div
        data-card-id={card.id}
        role="button"
        tabIndex={0}
        aria-label={`${card.titulo}, ${rangoCorto(card.fecha_inicio, card.fecha_fin)}`}
        onKeyDown={(e) => e.key === "Enter" && onAbrir(card)}
        onPointerDown={(e) => onPointerDown(e, card, "mover")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cn(
          "relative flex h-full touch-none items-center overflow-hidden rounded-lg border text-[0.72rem] font-semibold whitespace-nowrap shadow-[0_3px_8px_-5px_rgba(20,22,68,0.55)] transition-shadow",
          puede ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          "hover:shadow-[0_8px_18px_-10px_rgba(20,22,68,0.7)] focus-visible:ring-2 focus-visible:ring-morado/50 focus-visible:outline-none",
          arrastrando && "shadow-[0_14px_28px_-12px_rgba(20,22,68,0.75)] ring-2 ring-morado/40",
          destinoEnlace && "ring-2 ring-morado/30 ring-offset-1",
        )}
        style={{
          background: `color-mix(in srgb, ${base} 16%, #fff)`,
          borderColor: vencida ? "#dc2626" : `color-mix(in srgb, ${base} 45%, #fff)`,
          color: terminada ? "#047857" : "#141644",
        }}
      >
        <span className="absolute inset-y-0 left-0" style={{ width: `${avance * 100}%`, background: `color-mix(in srgb, ${base} 30%, #fff)` }} />
        {cabeTitulo && <span className="relative truncate px-2">{card.titulo}</span>}
        {puede && (
          <>
            <span
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
              onPointerDown={(e) => onPointerDown(e, card, "inicio")}
            >
              <span className="absolute inset-y-1.5 left-0.5 w-0.5 rounded-full bg-marino/40" />
            </span>
            <span
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
              onPointerDown={(e) => onPointerDown(e, card, "fin")}
            >
              <span className="absolute inset-y-1.5 right-0.5 w-0.5 rounded-full bg-marino/40" />
            </span>
          </>
        )}
      </div>

      {!cabeTitulo && (
        <span className="pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 text-[0.72rem] font-medium whitespace-nowrap text-texto">
          {card.titulo}
        </span>
      )}

      {arrastrando && (
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-md bg-marino px-2 py-1 text-[0.68rem] font-semibold whitespace-nowrap text-white shadow-lg">
          {rangoCorto(card.fecha_inicio, card.fecha_fin)}
        </span>
      )}

      {puede && (
        <span
          role="button"
          aria-label={`Enlazar «${card.titulo}» con otra tarjeta`}
          title="Arrastra hasta la tarjeta que debe ir después"
          onPointerDown={(e) => onConector(e, card)}
          onPointerMove={onConectorMove}
          onPointerUp={onConectorUp}
          className={cn(
            "absolute top-1/2 -right-3.5 size-3 -translate-y-1/2 cursor-crosshair touch-none rounded-full border-2 border-white bg-morado shadow",
            "opacity-0 transition-[opacity,transform] group-hover:opacity-100 hover:scale-125",
          )}
        />
      )}
    </div>
  );
}

// --- Flechas de dependencias --------------------------------------------------------------

function Flechas({
  dependencias,
  posiciones,
  ancho,
  alto,
  resaltada,
  seleccionada,
  onSeleccionar,
  enlace,
  origenEnlace,
}: {
  dependencias: Dependencia[];
  posiciones: Map<number, { x1: number; x2: number; y: number }>;
  ancho: number;
  alto: number;
  resaltada: number | null;
  seleccionada: number | null;
  onSeleccionar: (dep: Dependencia, e: ReactPointerEvent) => void;
  enlace: Enlace | null;
  origenEnlace?: { x1: number; x2: number; y: number };
}) {
  return (
    <svg className="pointer-events-none absolute inset-0 z-[5] overflow-visible" width={ancho} height={alto} aria-hidden>
      <defs>
        {[
          ["normal", "#9aa1c9"],
          ["activa", "#32407b"],
          ["incumplida", "#dc2626"],
        ].map(([id, color]) => (
          <marker key={id} id={`flecha-${id}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill={color} />
          </marker>
        ))}
      </defs>
      {dependencias.map((dep) => {
        const pred = posiciones.get(dep.predecesora);
        const suc = posiciones.get(dep.sucesora);
        if (!pred || !suc) return null;
        const d = rutaFlecha(dep, pred, suc);
        const activa = seleccionada === dep.id || resaltada === dep.predecesora || resaltada === dep.sucesora;
        const estado = dep.incumplida ? "incumplida" : activa ? "activa" : "normal";
        const color = { normal: "#9aa1c9", activa: "#32407b", incumplida: "#dc2626" }[estado];
        return (
          <g key={dep.id}>
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              className="cursor-pointer"
              style={{ pointerEvents: "stroke" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSeleccionar(dep, e);
              }}
            />
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={activa ? 2 : 1.5}
              strokeDasharray={dep.incumplida ? "5 4" : undefined}
              strokeLinejoin="round"
              markerEnd={`url(#flecha-${estado})`}
              className="transition-[stroke,stroke-width] duration-150"
            />
          </g>
        );
      })}
      {enlace && origenEnlace && (
        <path
          d={`M ${origenEnlace.x2} ${origenEnlace.y} C ${origenEnlace.x2 + 40} ${origenEnlace.y}, ${enlace.x - 40} ${enlace.y}, ${enlace.x} ${enlace.y}`}
          fill="none"
          stroke="#32407b"
          strokeWidth={2}
          strokeDasharray="6 4"
          markerEnd="url(#flecha-activa)"
        />
      )}
    </svg>
  );
}

function PanelDependencia({
  tableroId,
  seleccion,
  predecesora,
  sucesora,
  puede,
  onCerrar,
}: {
  tableroId: number;
  seleccion: Seleccion;
  predecesora?: CardResumen;
  sucesora?: CardResumen;
  puede: boolean;
  onCerrar: () => void;
}) {
  const editar = useEditarDependencia(tableroId);
  const eliminar = useEliminarDependencia(tableroId);
  const { dep } = seleccion;
  const [desfase, setDesfase] = useState(dep.desfase_dias);

  function guardarDesfase(valor: number) {
    const limpio = Math.max(-365, Math.min(365, Math.round(valor) || 0));
    setDesfase(limpio);
    if (limpio !== dep.desfase_dias) editar.mutate({ id: dep.id, cambios: { desfase_dias: limpio } });
  }

  return (
    <Popover.Root open onOpenChange={(v) => !v && onCerrar()}>
      <Popover.Anchor asChild>
        <span className="absolute size-px" style={{ left: seleccion.x, top: seleccion.y }} />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          className="flotante z-50 w-72 rounded-2xl border border-linea bg-white p-4 shadow-[0_24px_48px_-20px_rgba(20,22,68,0.5)]"
        >
          <div className="mb-3 flex items-start gap-2">
            <Waypoints className="mt-0.5 size-4 shrink-0 text-morado" />
            <p className="text-sm leading-snug text-texto">
              <span className="font-semibold">{predecesora?.titulo ?? `#${dep.predecesora}`}</span>
              <span className="text-tenue"> va antes de </span>
              <span className="font-semibold">{sucesora?.titulo ?? `#${dep.sucesora}`}</span>
            </p>
          </div>
          {dep.incumplida && (
            <p className="mb-3 rounded-lg bg-[#fef2f2] px-2.5 py-2 text-xs font-medium text-[#b91c1c]">
              La sucesora empieza antes de lo que esta dependencia permite. Muévela o activa «Mover sucesoras» y reprograma la predecesora.
            </p>
          )}
          <div className="space-y-1.5">
            {(Object.keys(ETIQUETAS_TIPO) as TipoDependencia[]).map((tipo) => (
              <button
                key={tipo}
                type="button"
                disabled={!puede}
                onClick={() => tipo !== dep.tipo && editar.mutate({ id: dep.id, cambios: { tipo } })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                  dep.tipo === tipo ? "border-morado bg-morado/8 font-semibold text-morado" : "border-linea text-texto hover:border-morado/40",
                )}
              >
                <span className="w-6 font-bold">{ETIQUETAS_TIPO[tipo].corta}</span>
                {ETIQUETAS_TIPO[tipo].larga}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-tenue">Desfase (días hábiles)</span>
            <div className="flex items-center gap-1">
              <Boton variante="secundario" tamano="icono-sm" aria-label="Un día menos" disabled={!puede} onClick={() => guardarDesfase(desfase - 1)}>
                <Minus />
              </Boton>
              <input
                type="number"
                value={desfase}
                disabled={!puede}
                onChange={(e) => setDesfase(Number(e.target.value))}
                onBlur={() => guardarDesfase(desfase)}
                onKeyDown={(e) => e.key === "Enter" && guardarDesfase(desfase)}
                className="h-7 w-14 rounded-lg border border-linea text-center text-sm font-semibold tabular-nums outline-none focus:border-morado"
              />
              <Boton variante="secundario" tamano="icono-sm" aria-label="Un día más" disabled={!puede} onClick={() => guardarDesfase(desfase + 1)}>
                <Plus />
              </Boton>
            </div>
          </div>
          {puede && (
            <Boton
              variante="peligro"
              tamano="sm"
              className="mt-4 w-full"
              cargando={eliminar.isPending}
              onClick={() => eliminar.mutate(dep, { onSuccess: onCerrar })}
            >
              <Trash2 />
              Quitar dependencia
            </Boton>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// --- Bandeja «Sin fechas» -------------------------------------------------------------------

function Bandeja({
  cards,
  puede,
  colocando,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  cards: CardResumen[];
  puede: boolean;
  colocando: Colocando | null;
  onPointerDown: (e: ReactPointerEvent, card: CardResumen) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
}) {
  return (
    <aside className="self-start rounded-2xl border border-linea bg-white p-3 shadow-[0_18px_40px_-32px_rgba(20,22,68,0.45)] lg:sticky lg:top-4">
      <h4 className="mb-1 flex items-center gap-1.5 text-[0.72rem] font-bold tracking-[0.08em] text-tenue uppercase">
        Sin fechas
        <span className="ml-auto rounded-full bg-columna px-1.5 text-[0.68rem] tabular-nums">{cards.length}</span>
      </h4>
      <p className="mb-3 text-xs text-tenue">
        {cards.length
          ? puede
            ? "Arrastra una tarjeta a la línea de tiempo para darle fecha."
            : "Estas tarjetas aún no tienen inicio y fin."
          : "Todas las tarjetas del Gantt tienen fechas."}
      </p>
      <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {cards.map((card) => {
          const activa = colocando?.card.id === card.id && colocando.movido;
          return (
            <li
              key={card.id}
              role="button"
              tabIndex={0}
              onPointerDown={(e) => onPointerDown(e, card)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={cn(
                "flex touch-none items-center gap-2 rounded-xl border border-linea bg-white px-2.5 py-2 text-[0.8rem] font-medium text-texto transition-all select-none",
                puede ? "cursor-grab hover:border-morado/40 hover:shadow-sm" : "cursor-pointer hover:border-morado/40",
                activa && "opacity-40",
              )}
            >
              <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: URGENCIAS[card.urgencia].color }} />
              <span className="min-w-0 flex-1 truncate">{card.titulo}</span>
              <span className="text-[0.68rem] text-tenue/60">#{card.numero}</span>
            </li>
          );
        })}
      </ul>
      {colocando?.movido && (
        <div
          className="pointer-events-none fixed z-[70] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border border-morado/30 bg-white px-3 py-2 text-[0.8rem] font-semibold text-marino shadow-[0_18px_36px_-14px_rgba(20,22,68,0.6)]"
          style={{ left: colocando.x, top: colocando.y }}
        >
          <span className="h-4 w-[3px] rounded-full" style={{ background: URGENCIAS[colocando.card.urgencia].color }} />
          {colocando.card.titulo}
        </div>
      )}
    </aside>
  );
}
