/**
 * Dependencias desde la tarjeta abierta: las mismas que se dibujan como
 * flechas en el Gantt, para enlazar sin tener que ir a esa vista (también en
 * el teléfono, donde el Gantt no enlaza). Las reglas (ciclos, repetidas, a sí
 * misma) las valida el servidor; aquí solo se ofrece y se refleja.
 */

import { ArrowRight, CircleCheck, Link2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useState, type ReactNode } from "react";

import { useCrearDependencia, useDependencias, useEditarDependencia, useEliminarDependencia } from "@/api/queries";
import type { CardDetalle, CardResumen, Dependencia, TableroDetalle, TipoDependencia } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { cn } from "@/lib/cn";

const estiloFlotante =
  "flotante z-[60] rounded-2xl border border-linea bg-white shadow-[0_24px_48px_-20px_rgba(20,22,68,0.5)]";

export function DependenciasTarjeta({
  card,
  tablero,
  puede,
  onAbrirOtra,
}: {
  card: CardDetalle;
  tablero: TableroDetalle;
  puede: boolean;
  /** Abrir la otra tarjeta de una dependencia (sin esto no se ofrece). */
  onAbrirOtra?: (numero: number) => void;
}) {
  const { data: dependencias = [] } = useDependencias(tablero.id);
  const porId = useMemo(() => new Map(tablero.cards.map((c) => [c.id, c])), [tablero.cards]);
  const antes = dependencias.filter((d) => d.sucesora === card.id);
  const despues = dependencias.filter((d) => d.predecesora === card.id);

  return (
    <div className="space-y-2.5">
      {antes.length > 0 && (
        <Grupo titulo="Espera a (van primero)">
          {antes.map((d) => (
            <FilaDependencia
              key={d.id}
              dep={d}
              otra={porId.get(d.predecesora)}
              predecesora={porId.get(d.predecesora)}
              sucesora={card}
              tableroId={tablero.id}
              puede={puede}
              onAbrirOtra={onAbrirOtra}
            />
          ))}
        </Grupo>
      )}
      {despues.length > 0 && (
        <Grupo titulo="La esperan (van después)">
          {despues.map((d) => (
            <FilaDependencia
              key={d.id}
              dep={d}
              otra={porId.get(d.sucesora)}
              predecesora={card}
              sucesora={porId.get(d.sucesora)}
              tableroId={tablero.id}
              puede={puede}
              onAbrirOtra={onAbrirOtra}
            />
          ))}
        </Grupo>
      )}
      {antes.length === 0 && despues.length === 0 && (
        <p className="text-sm text-tenue/70">Sin dependencias.</p>
      )}
      {puede && <Enlazar card={card} tablero={tablero} dependencias={dependencias} />}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[0.7rem] font-semibold text-tenue">{titulo}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

/** Una dependencia: la otra tarjeta y su tipo; al tocarla se edita. */
function FilaDependencia({
  dep,
  otra,
  predecesora,
  sucesora,
  tableroId,
  puede,
  onAbrirOtra,
}: {
  dep: Dependencia;
  otra?: CardResumen;
  predecesora?: RefTarjeta;
  sucesora?: RefTarjeta;
  tableroId: number;
  puede: boolean;
  onAbrirOtra?: (numero: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const terminada = otra?.vencimiento === "terminada";

  return (
    <li>
      <Popover.Root open={abierto} onOpenChange={setAbierto}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-sm transition-colors pointer-coarse:py-2.5",
              dep.incumplida
                ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c] hover:border-[#f87171]"
                : "border-linea text-texto hover:border-morado/40 hover:bg-fondo",
            )}
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="mr-1 text-[0.72rem] text-tenue/70">#{otra?.numero ?? "?"}</span>
              <span className={cn("font-medium", terminada && "text-tenue line-through decoration-tenue/40")}>
                {otra?.titulo ?? "Tarjeta archivada"}
              </span>
            </span>
            {terminada && <CircleCheck className="size-3.5 shrink-0 text-[#059669]" aria-label="Terminada" />}
            {(dep.tipo !== "fin_inicio" || dep.desfase_dias !== 0) && (
              <span className="shrink-0 rounded-md bg-morado/8 px-1.5 py-0.5 text-[0.66rem] font-semibold text-morado">
                {resumenTipo(dep)}
              </span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={6} collisionPadding={12} className={cn(estiloFlotante, "w-[min(20rem,calc(100vw-1.5rem))] p-4")}>
            <EditorDependencia
              tableroId={tableroId}
              dep={dep}
              predecesora={predecesora}
              sucesora={sucesora}
              puede={puede}
              onQuitada={() => setAbierto(false)}
            />
            {onAbrirOtra && otra && (
              <Boton
                variante="secundario"
                tamano="sm"
                className="mt-2 w-full"
                onClick={() => {
                  setAbierto(false);
                  onAbrirOtra(otra.numero);
                }}
              >
                Abrir #{otra.numero}
                <ArrowRight />
              </Boton>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </li>
  );
}

type RefTarjeta = { numero: number; titulo: string };

/** Cómo se unen las dos tarjetas, en palabras («la siguiente» es la sucesora). */
const TIPOS: { id: TipoDependencia; titulo: (a: string, b: string) => string; ejemplo: string }[] = [
  {
    id: "fin_inicio",
    titulo: (a, b) => `${b} empieza cuando ${a} termina`,
    ejemplo: "Lo normal: una tarea detrás de otra (primero el plano, después la compra).",
  },
  {
    id: "inicio_inicio",
    titulo: (a, b) => `${b} empieza cuando ${a} empieza`,
    ejemplo: "Arrancan juntas y avanzan a la vez.",
  },
  {
    id: "fin_fin",
    titulo: (a, b) => `${b} termina cuando ${a} termina`,
    ejemplo: "Pueden empezar cuando sea, pero cierran juntas.",
  },
];

/** Etiqueta corta de una dependencia que no es la habitual (fin → inicio sin espera). */
function resumenTipo(dep: Dependencia): string {
  const base = dep.tipo === "inicio_inicio" ? "Empiezan juntas" : dep.tipo === "fin_fin" ? "Terminan juntas" : "";
  const dias =
    dep.desfase_dias === 0 ? "" : dep.desfase_dias > 0 ? `+${dep.desfase_dias} d` : `${dep.desfase_dias} d`;
  return [base, dias].filter(Boolean).join(" · ");
}

function nombre(card: RefTarjeta | undefined, respaldo: number) {
  return card ? `#${card.numero}` : `#${respaldo}`;
}

/**
 * Tipo, días de espera y quitar una dependencia, explicado con las dos
 * tarjetas por su número. Lo comparten la tarjeta abierta y el panel de una
 * flecha del Gantt (`gantt/Dependencias.tsx`).
 */
export function EditorDependencia({
  tableroId,
  dep,
  predecesora,
  sucesora,
  puede,
  onQuitada,
}: {
  tableroId: number;
  dep: Dependencia;
  predecesora?: RefTarjeta;
  sucesora?: RefTarjeta;
  puede: boolean;
  onQuitada: () => void;
}) {
  const editar = useEditarDependencia(tableroId);
  const eliminar = useEliminarDependencia(tableroId);
  const [desfase, setDesfase] = useState(dep.desfase_dias);
  const a = nombre(predecesora, dep.predecesora);
  const b = nombre(sucesora, dep.sucesora);

  function guardarDesfase(valor: number) {
    const limpio = Math.max(-365, Math.min(365, Math.round(valor) || 0));
    setDesfase(limpio);
    if (limpio !== dep.desfase_dias) editar.mutate({ id: dep.id, cambios: { desfase_dias: limpio } });
  }

  const momento = dep.tipo === "fin_fin" ? "termina" : "empieza";
  const explicacionDias =
    desfase === 0
      ? "Sin espera."
      : desfase > 0
        ? `${b} ${momento} ${desfase} ${desfase === 1 ? "día hábil" : "días hábiles"} más tarde.`
        : `${b} puede adelantarse ${-desfase} ${desfase === -1 ? "día hábil" : "días hábiles"} (se solapan).`;

  return (
    <>
      <div className="mb-3 space-y-1 text-sm leading-snug">
        <p className="flex gap-1.5">
          <span className="w-14 shrink-0 text-[0.7rem] font-semibold text-tenue uppercase">Primero</span>
          <span className="min-w-0 font-semibold text-texto">
            {a} {predecesora?.titulo}
          </span>
        </p>
        <p className="flex gap-1.5">
          <span className="w-14 shrink-0 text-[0.7rem] font-semibold text-tenue uppercase">Después</span>
          <span className="min-w-0 font-semibold text-texto">
            {b} {sucesora?.titulo}
          </span>
        </p>
      </div>
      {dep.incumplida && (
        <p className="mb-3 rounded-lg bg-[#fef2f2] px-2.5 py-2 text-xs font-medium text-[#b91c1c]">
          Las fechas no lo cumplen: {b} está programada antes de tiempo. Cambia sus fechas o, en el Gantt, activa «Mover
          sucesoras» y vuelve a mover {a}.
        </p>
      )}
      <p className="mb-1.5 text-xs font-semibold text-tenue">¿Cómo se unen?</p>
      <div className="space-y-1.5">
        {TIPOS.map((t) => {
          const activa = dep.tipo === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={!puede}
              aria-pressed={activa}
              onClick={() => !activa && editar.mutate({ id: dep.id, cambios: { tipo: t.id } })}
              className={cn(
                "flex w-full flex-col rounded-lg border px-2.5 py-1.5 text-left transition-colors pointer-coarse:py-2",
                activa ? "border-morado bg-morado/8" : "border-linea hover:border-morado/40",
              )}
            >
              <span className={cn("text-xs", activa ? "font-semibold text-morado" : "font-medium text-texto")}>
                {t.titulo(a, b)}
              </span>
              <span className="text-[0.68rem] leading-snug text-tenue">{t.ejemplo}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-tenue">Días de espera</span>
          <div className="flex items-center gap-1">
            <Boton variante="secundario" tamano="icono-sm" aria-label="Un día menos" disabled={!puede} onClick={() => guardarDesfase(desfase - 1)}>
              <Minus />
            </Boton>
            <input
              type="number"
              value={desfase}
              disabled={!puede}
              aria-label="Días de espera"
              onChange={(e) => setDesfase(Number(e.target.value))}
              onBlur={() => guardarDesfase(desfase)}
              onKeyDown={(e) => e.key === "Enter" && guardarDesfase(desfase)}
              className="h-7 w-14 rounded-lg border border-linea text-center text-sm font-semibold tabular-nums outline-none focus:border-morado pointer-coarse:h-9"
            />
            <Boton variante="secundario" tamano="icono-sm" aria-label="Un día más" disabled={!puede} onClick={() => guardarDesfase(desfase + 1)}>
              <Plus />
            </Boton>
          </div>
        </div>
        <p className="mt-1 text-[0.68rem] text-tenue">{explicacionDias} Se cuentan de lunes a viernes, sin feriados.</p>
      </div>
      {puede && (
        <Boton
          variante="peligro"
          tamano="sm"
          className="mt-4 w-full"
          cargando={eliminar.isPending}
          onClick={() => eliminar.mutate(dep, { onSuccess: onQuitada })}
        >
          <Trash2 />
          Quitar dependencia
        </Boton>
      )}
    </>
  );
}

type Sentido = "despues" | "antes";

/** Elegir otra tarjeta del tablero y enlazarla (fin → inicio, como en el Gantt). */
function Enlazar({
  card,
  tablero,
  dependencias,
}: {
  card: CardDetalle;
  tablero: TableroDetalle;
  dependencias: Dependencia[];
}) {
  const crear = useCrearDependencia(tablero.id);
  const [abierto, setAbierto] = useState(false);
  const [sentido, setSentido] = useState<Sentido>("despues");
  const [busqueda, setBusqueda] = useState("");

  const enlazadas = new Set(
    dependencias.flatMap((d) => (d.sucesora === card.id ? [d.predecesora] : d.predecesora === card.id ? [d.sucesora] : [])),
  );
  const clave = sinAcentos(busqueda.trim());
  const candidatas = tablero.cards
    .filter((c) => c.id !== card.id && !enlazadas.has(c.id))
    .filter((c) => !clave || sinAcentos(c.titulo).includes(clave) || `#${c.numero}`.startsWith(clave) || String(c.numero) === clave)
    // Primero las abiertas, por número: las terminadas rara vez se enlazan.
    .sort((a, b) => Number(a.vencimiento === "terminada") - Number(b.vencimiento === "terminada") || a.numero - b.numero);

  function enlazar(otra: CardResumen) {
    const datos =
      sentido === "despues" ? { predecesora: otra.id, sucesora: card.id } : { predecesora: card.id, sucesora: otra.id };
    crear.mutate(datos, {
      onSuccess: () => {
        setAbierto(false);
        setBusqueda("");
      },
    });
  }

  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger asChild>
        <Boton variante="suave" tamano="sm" className="w-full">
          <Link2 />
          Enlazar tarjeta
        </Boton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          // Alto acotado al espacio que Radix deja libre en el lado elegido: con
          // un tope fijo, dentro del iframe del Portal el globo se salía por arriba.
          className={cn(
            estiloFlotante,
            "flex max-h-[min(26rem,var(--radix-popover-content-available-height))] w-[min(20rem,calc(100vw-1.5rem))] flex-col p-2",
          )}
        >
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-fondo p-1">
            {(
              [
                ["despues", "Va después de…"],
                ["antes", "Va antes de…"],
              ] as const
            ).map(([id, etiqueta]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSentido(id)}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors pointer-coarse:py-2",
                  sentido === id ? "bg-white text-morado shadow-sm" : "text-tenue hover:text-morado",
                )}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <p className="px-1.5 pt-2 pb-1.5 text-[0.72rem] leading-snug text-tenue">
            {sentido === "despues"
              ? "Esta tarjeta empieza cuando termine la que elijas."
              : "La que elijas empieza cuando termine esta."}
          </p>
          <label className="relative mb-1.5 block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-tenue" />
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por título o #número"
              aria-label="Buscar tarjeta"
              className="h-9 w-full rounded-xl border border-linea bg-white pr-3 pl-8 text-sm outline-none focus:border-morado/50 max-sm:text-base"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {candidatas.length === 0 && (
              <p className="px-2.5 py-3 text-center text-xs text-tenue">
                {busqueda ? "Ninguna tarjeta coincide." : "No hay otras tarjetas para enlazar."}
              </p>
            )}
            {candidatas.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={crear.isPending}
                onClick={() => enlazar(c)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-morado/8 disabled:opacity-50 pointer-coarse:py-2.5"
              >
                <span className="w-8 shrink-0 text-[0.72rem] text-tenue/70 tabular-nums">#{c.numero}</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    c.vencimiento === "terminada" && "text-tenue line-through decoration-tenue/40",
                  )}
                >
                  {c.titulo}
                </span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function sinAcentos(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
