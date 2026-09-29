import { ChevronLeft, ChevronRight, CircleCheck, Move, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Popover } from "radix-ui";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useFeriados, useProgramarCard } from "@/api/queries";
import type { CardResumen, Feriado, TableroDetalle } from "@/api/tipos";
import { NuevaTareaDialogo } from "@/components/tablero/NuevaTareaDialogo";
import { Boton } from "@/components/ui/Boton";
import { Pildora } from "@/components/ui/Estados";
import { cn } from "@/lib/cn";
import { CARRILES_VISIBLES, distribuir, rangoDe, type Segmento } from "@/lib/calendarioMes";
import { DIAS_SEMANA, aISO, esFinDeSemana, inicioMes, mismoDia, nombreMes, sumarDiasISO } from "@/lib/dias";
import { URGENCIAS } from "@/lib/estilos";
import { hoy as hoyLocal } from "@/lib/fechas";

import { BotonCalendarioLaboral } from "./CalendarioLaboral";
import { CalendarioMovil } from "./CalendarioMovil";

const ALTO_CARRIL = 24;
const ALTO_CABECERA = 28;

type Arrastre = { card: CardResumen; diaOrigen: string; diaActual: string; x: number; y: number; movido: boolean };
/** Días elegidos para una tarea nueva: desde donde se pulsó hasta donde va el puntero. */
type Seleccion = { ancla: string; actual: string };
type Fechas = { inicio: string; fin: string };

const ordenar = (s: Seleccion): Fechas => (s.ancla <= s.actual ? { inicio: s.ancla, fin: s.actual } : { inicio: s.actual, fin: s.ancla });

export function VistaCalendario({
  tablero,
  visibles,
  onAbrir,
}: {
  tablero: TableroDetalle;
  visibles: CardResumen[];
  onAbrir: (card: CardResumen) => void;
}) {
  const [mes, setMes] = useState(() => inicioMes(hoyLocal()));
  const [direccion, setDireccion] = useState(0);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  // Día elegido en el calendario del teléfono (su lista de tarjetas).
  const [diaElegido, setDiaElegido] = useState(() => aISO(hoyLocal()));
  const programar = useProgramarCard(tablero.id);
  const puede = tablero.permisos.editar;
  // Tarea nueva: `fechasNueva` se conserva al cerrar para no cambiar el
  // formulario durante la animación de salida.
  const [creando, setCreando] = useState(false);
  const [fechasNueva, setFechasNueva] = useState<Fechas | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const seleccionRef = useRef<Seleccion | null>(null);

  function crear(fechas: Fechas | null) {
    setFechasNueva(fechas);
    setCreando(true);
  }

  const semanas = useMemo(() => distribuir(mes, visibles), [mes, visibles]);
  const desde = aISO(semanas[0].dias[0]);
  const hasta = aISO(semanas[5].dias[6]);
  const { data: feriados } = useFeriados(desde, hasta);
  const porFecha = useMemo(() => new Map((feriados ?? []).map((f) => [f.fecha, f])), [feriados]);
  const sinFecha = visibles.filter((c) => !rangoDe(c)).length;

  function irA(delta: number) {
    const nuevo = new Date(mes.getFullYear(), mes.getMonth() + delta, 1);
    const hoyDia = hoyLocal();
    setDireccion(delta);
    setMes(nuevo);
    setDiaElegido(mismoDia(nuevo, inicioMes(hoyDia)) ? aISO(hoyDia) : aISO(nuevo));
  }

  // --- Arrastrar una tarjeta a otro día (conserva su duración) -----------------------
  const arrastreRef = useRef<Arrastre | null>(null);

  function diaBajo(x: number, y: number): string | null {
    // Plural: la barra arrastrada tapa la celda; se busca debajo de ella.
    const el = document.elementsFromPoint(x, y).find((n): n is HTMLElement => n instanceof HTMLElement && Boolean(n.dataset.dia));
    return el?.dataset.dia ?? null;
  }

  function empezar(e: ReactPointerEvent, card: CardResumen) {
    if (e.button !== 0) return;
    const dia = diaBajo(e.clientX, e.clientY);
    if (!dia) return;
    const inicial = { card, diaOrigen: dia, diaActual: dia, x: e.clientX, y: e.clientY, movido: false };
    arrastreRef.current = inicial;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  // --- Elegir días para una tarea nueva: clic en un día o arrastrar sobre varios ------
  function empezarSeleccion(e: ReactPointerEvent, iso: string) {
    if (!puede || e.button !== 0) return;
    // «+N más» es un botón del día: abre su lista, no crea.
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const inicial = { ancla: iso, actual: iso };
    seleccionRef.current = inicial;
    setSeleccion(inicial);
  }

  function cancelar() {
    arrastreRef.current = null;
    seleccionRef.current = null;
    setArrastre(null);
    setSeleccion(null);
  }

  function mover(e: ReactPointerEvent) {
    const sel = seleccionRef.current;
    if (sel) {
      const dia = diaBajo(e.clientX, e.clientY);
      if (dia && dia !== sel.actual) {
        seleccionRef.current = { ...sel, actual: dia };
        setSeleccion(seleccionRef.current);
      }
      return;
    }
    const actual = arrastreRef.current;
    if (!actual) return;
    const movido = actual.movido || Math.hypot(e.clientX - actual.x, e.clientY - actual.y) > 5;
    if (!movido || !puede) return;
    const dia = diaBajo(e.clientX, e.clientY) ?? actual.diaActual;
    const siguiente = { ...actual, movido, diaActual: dia };
    arrastreRef.current = siguiente;
    setArrastre(siguiente);
  }

  function soltar() {
    const sel = seleccionRef.current;
    if (sel) {
      seleccionRef.current = null;
      setSeleccion(null);
      crear(ordenar(sel));
      return;
    }
    const actual = arrastreRef.current;
    arrastreRef.current = null;
    setArrastre(null);
    if (!actual) return;
    if (!actual.movido) {
      onAbrir(actual.card);
      return;
    }
    const delta = Math.round(
      (new Date(`${actual.diaActual}T00:00`).getTime() - new Date(`${actual.diaOrigen}T00:00`).getTime()) / 86_400_000,
    );
    if (!delta) return;
    const { card } = actual;
    programar.mutate({
      card,
      inicio: card.fecha_inicio && sumarDiasISO(card.fecha_inicio, delta),
      fin: card.fecha_fin && sumarDiasISO(card.fecha_fin, delta),
      moverSucesoras: true,
    });
  }

  /** Días que ocuparía la tarjeta arrastrada (para resaltarlos). */
  const destino = useMemo(() => {
    if (!arrastre) return null;
    const rango = rangoDe(arrastre.card);
    if (!rango) return null;
    const delta = Math.round(
      (new Date(`${arrastre.diaActual}T00:00`).getTime() - new Date(`${arrastre.diaOrigen}T00:00`).getTime()) / 86_400_000,
    );
    return [sumarDiasISO(rango[0], delta), sumarDiasISO(rango[1], delta)] as const;
  }, [arrastre]);

  const elegidos = seleccion ? ordenar(seleccion) : null;
  const hoy = hoyLocal();

  return (
    <div className="animate-rise overflow-hidden rounded-2xl border border-linea bg-white shadow-[0_18px_40px_-32px_rgba(20,22,68,0.45)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-linea px-4 py-3">
        <div className="flex items-center gap-1">
          <Boton variante="secundario" tamano="icono" aria-label="Mes anterior" onClick={() => irA(-1)}>
            <ChevronLeft />
          </Boton>
          <Boton variante="secundario" tamano="icono" aria-label="Mes siguiente" onClick={() => irA(1)}>
            <ChevronRight />
          </Boton>
        </div>
        <h3 className="min-w-44 font-display text-lg font-semibold text-marino capitalize">{nombreMes(mes)}</h3>
        <Boton
          variante="suave"
          tamano="sm"
          disabled={mismoDia(mes, inicioMes(hoy))}
          onClick={() => {
            setDireccion(0);
            setMes(inicioMes(hoy));
            setDiaElegido(aISO(hoy));
          }}
        >
          Hoy
        </Boton>
        {puede && (
          <Boton tamano="sm" onClick={() => crear(null)}>
            <Plus />
            Tarea
          </Boton>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-tenue">
          {sinFecha > 0 && <Pildora>{sinFecha} sin fecha</Pildora>}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-rojo/30 bg-rojo/10" />
            Feriado
          </span>
          {puede && (
            <span className="hidden items-center gap-1 md:inline-flex pointer-coarse:hidden">
              <Move className="size-3.5" />
              Clic en un día: nueva tarea · Arrastra una tarea: cambia su fecha
            </span>
          )}
          <BotonCalendarioLaboral />
        </div>
      </div>

      <CalendarioMovil
        dias={semanas.flatMap((s) => s.dias)}
        mes={mes}
        hoy={hoy}
        feriados={porFecha}
        cards={visibles}
        seleccionado={diaElegido}
        onSeleccionar={setDiaElegido}
        onAbrir={onAbrir}
        onCrear={puede ? (iso) => crear({ inicio: iso, fin: iso }) : undefined}
      />

      <div className="overflow-x-auto max-sm:hidden">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-linea bg-fondo/70">
            {DIAS_SEMANA.map((d, i) => (
              <div key={d} className={cn("px-2 py-2 text-center text-[0.7rem] font-bold tracking-[0.08em] uppercase", i >= 5 ? "text-tenue/60" : "text-tenue")}>
                {d}
              </div>
            ))}
          </div>

          <AnimatePresence mode="popLayout" initial={false} custom={direccion}>
            <motion.div
              key={aISO(mes)}
              custom={direccion}
              initial={{ opacity: 0, x: direccion * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direccion * -40 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onPointerMove={mover}
              onPointerUp={soltar}
              onPointerCancel={cancelar}
              className={cn(arrastre?.movido && "cursor-grabbing select-none", seleccion && "select-none")}
            >
              {semanas.map((semana) => (
                <div
                  key={aISO(semana.dias[0])}
                  className="relative grid grid-cols-7 border-b border-linea/70 last:border-0"
                  style={{ minHeight: ALTO_CABECERA + CARRILES_VISIBLES * ALTO_CARRIL + 22 }}
                >
                  {semana.dias.map((dia, col) => {
                    const iso = aISO(dia);
                    const feriado = porFecha.get(iso);
                    const fuera = dia.getMonth() !== mes.getMonth();
                    const esHoy = mismoDia(dia, hoy);
                    const resaltado =
                      (destino && iso >= destino[0] && iso <= destino[1]) ||
                      (elegidos && iso >= elegidos.inicio && iso <= elegidos.fin);
                    return (
                      <Dia
                        key={iso}
                        iso={iso}
                        dia={dia}
                        feriado={feriado}
                        fuera={fuera}
                        esHoy={esHoy}
                        resaltado={Boolean(resaltado)}
                        ocultas={semana.ocultas[col]}
                        cards={visibles}
                        onAbrir={onAbrir}
                        onPointerDown={puede ? (e) => empezarSeleccion(e, iso) : undefined}
                      />
                    );
                  })}
                  {semana.segmentos.map((s) => (
                    <BarraDia
                      key={s.card.id}
                      segmento={s}
                      arrastrando={arrastre?.movido === true && arrastre.card.id === s.card.id}
                      onPointerDown={(e) => empezar(e, s.card)}
                      onTeclado={() => onAbrir(s.card)}
                    />
                  ))}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {puede && (
        <NuevaTareaDialogo
          tablero={tablero}
          abierto={creando}
          origen="calendario"
          fechas={fechasNueva}
          onCerrar={() => setCreando(false)}
        />
      )}
    </div>
  );
}

function Dia({
  iso,
  dia,
  feriado,
  fuera,
  esHoy,
  resaltado,
  ocultas,
  cards,
  onAbrir,
  onPointerDown,
}: {
  iso: string;
  dia: Date;
  feriado?: Feriado;
  fuera: boolean;
  esHoy: boolean;
  resaltado: boolean;
  ocultas: number;
  cards: CardResumen[];
  onAbrir: (card: CardResumen) => void;
  /** Sin él (solo lectura) el día no crea tareas. */
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-dia={iso}
      onPointerDown={onPointerDown}
      className={cn(
        "group/dia relative border-r border-linea/60 px-1.5 pt-1 transition-colors duration-150 last:border-r-0",
        onPointerDown && "cursor-pointer hover:bg-morado/[0.035]",
        esFinDeSemana(dia) && "bg-fondo/80",
        feriado && "bg-rojo/[0.06]",
        resaltado && "bg-morado/10 ring-1 ring-morado/30 ring-inset",
      )}
      title={feriado?.nombre}
    >
      <div className="flex items-center gap-1" style={{ height: ALTO_CABECERA - 4 }}>
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            esHoy ? "bg-morado text-white shadow-[0_4px_10px_-4px_rgba(50,64,123,0.9)]" : fuera ? "text-tenue/40" : "text-texto",
          )}
        >
          {dia.getDate()}
        </span>
        {feriado && (
          <span className={cn("truncate text-[0.62rem] font-semibold text-rojo", fuera && "opacity-50")}>{feriado.nombre}</span>
        )}
        {onPointerDown && (
          <Plus
            aria-hidden
            className="ml-auto size-4 shrink-0 rounded text-morado opacity-0 transition-opacity group-hover/dia:opacity-70"
          />
        )}
      </div>
      {ocultas > 0 && (
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="absolute bottom-1 left-1.5 rounded px-1 text-[0.68rem] font-semibold text-morado hover:bg-morado/8"
            >
              +{ocultas} más
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={4}
              className="flotante z-50 w-64 rounded-xl border border-linea bg-white p-2 shadow-[0_18px_38px_-18px_rgba(20,22,68,0.4)]"
            >
              <p className="px-1.5 pb-1.5 text-xs font-semibold text-tenue">{dia.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" })}</p>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {cards
                  .filter((c) => {
                    const r = rangoDe(c);
                    return r && r[0] <= iso && r[1] >= iso;
                  })
                  .map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onAbrir(c)}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm text-texto hover:bg-morado/8"
                      >
                        <span className="size-2 shrink-0 rounded-full" style={{ background: URGENCIAS[c.urgencia].color }} />
                        <span className="truncate">{c.titulo}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}

function BarraDia({
  segmento,
  arrastrando,
  onPointerDown,
  onTeclado,
}: {
  segmento: Segmento;
  arrastrando: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onTeclado: () => void;
}) {
  const { card, desde, largo, carril, sigueAntes, sigueDespues } = segmento;
  const color = URGENCIAS[card.urgencia].color;
  const terminada = card.vencimiento === "terminada";
  const vencida = card.vencimiento === "vencida";
  return (
    <motion.button
      type="button"
      layout
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      onPointerDown={onPointerDown}
      // Con ratón el clic lo resuelve `soltar` (distingue clic de arrastre);
      // `detail === 0` es Enter/Espacio.
      onClick={(e) => e.detail === 0 && onTeclado()}
      className={cn(
        "absolute flex h-[21px] touch-none items-center gap-1 pointer-coarse:touch-auto overflow-hidden border px-1.5 text-left text-[0.72rem] font-semibold whitespace-nowrap shadow-[0_2px_6px_-4px_rgba(20,22,68,0.5)] transition-[opacity,box-shadow] hover:shadow-[0_6px_14px_-8px_rgba(20,22,68,0.6)]",
        sigueAntes ? "rounded-l-none border-l-0" : "rounded-l-md",
        sigueDespues ? "rounded-r-none border-r-0" : "rounded-r-md",
        arrastrando && "opacity-40",
      )}
      style={{
        top: ALTO_CABECERA + carril * ALTO_CARRIL,
        left: `calc(${(desde / 7) * 100}% + ${sigueAntes ? 0 : 3}px)`,
        width: `calc(${(largo / 7) * 100}% - ${(sigueAntes ? 0 : 3) + (sigueDespues ? 0 : 3)}px)`,
        background: terminada ? "#ecfdf5" : `color-mix(in srgb, ${color} 13%, #fff)`,
        borderColor: terminada ? "#a7f3d0" : `color-mix(in srgb, ${color} 35%, #fff)`,
        color: terminada ? "#047857" : vencida ? "#b91c1c" : "#2a2f52",
      }}
      title={`#${card.numero} ${card.titulo}`}
    >
      {!sigueAntes && <span className="h-3 w-[3px] shrink-0 rounded-full" style={{ background: terminada ? "#059669" : color }} />}
      {terminada && <CircleCheck className="size-3 shrink-0" />}
      <span className={cn("truncate", terminada && "line-through decoration-current/40")}>{card.titulo}</span>
    </motion.button>
  );
}
