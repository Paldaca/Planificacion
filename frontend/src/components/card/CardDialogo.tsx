import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Check,
  CircleCheck,
  ArrowRightLeft,
  ChartGantt,
  Flag,
  History,
  LayoutGrid,
  MessageSquare,
  Plus,
  Settings2,
  Tag,
  TextAlignStart,
  UsersRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog, Popover } from "radix-ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import {
  useArchivarCard,
  useCard,
  useDependencias,
  usePatchCard,
  useTablero,
  useTableros,
  useTrasladarCard,
  type CambiosCard,
} from "@/api/queries";
import type { CardDetalle, EnGantt, Persona, TableroDetalle } from "@/api/tipos";
import { nombreVisible, useIdentidad } from "@/auth/useIdentidad";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto, Pildora } from "@/components/ui/Estados";
import { cn } from "@/lib/cn";
import { LISTA_URGENCIAS, URGENCIAS, VENCIMIENTOS } from "@/lib/estilos";
import { haceCuanto, relativoFin } from "@/lib/fechas";

import { Checklist } from "./Checklist";
import { Comentarios } from "./Comentarios";
import { CamposTarjeta, EtiquetasTarjeta } from "./EtiquetasYCampos";
import { Historial } from "./Historial";

type Props = {
  tableroId: number;
  numero: number;
  onCerrar: () => void;
  enlaceTablero?: ReactNode;
  /** La tarjeta cambió de tablero (su URL ya no es la misma). */
  onTrasladada?: (card: CardDetalle) => void;
};

export function CardDialogo({ tableroId, numero, onCerrar, enlaceTablero, onTrasladada }: Props) {
  const [abierto, setAbierto] = useState(true);
  const cerrar = () => setAbierto(false);

  return (
    <Dialog.Root open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialogo-fondo fixed inset-0 z-50 bg-marino/45 backdrop-blur-[3px]" />
        <Dialog.Content
          onAnimationEnd={(e) => e.target === e.currentTarget && !abierto && onCerrar()}
          // Sin esto Radix enfoca el primer campo (el título) y la tarjeta se
          // abre como si estuviera en edición: el foco va al propio panel.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className={cn(
            "dialogo-panel fixed inset-0 z-50 flex flex-col overflow-hidden bg-white focus:outline-none",
            "sm:inset-auto sm:top-[4vh] sm:left-1/2 sm:max-h-[92vh] sm:w-[min(980px,calc(100vw-2rem))] sm:-translate-x-1/2",
            "sm:rounded-[24px] sm:border sm:border-linea sm:shadow-[0_40px_80px_-30px_rgba(20,22,68,0.55)]",
          )}
        >
          <Contenido tableroId={tableroId} numero={numero} enlaceTablero={enlaceTablero} onTrasladada={onTrasladada} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Contenido({ tableroId, numero, enlaceTablero, onTrasladada }: Omit<Props, "onCerrar">) {
  const { data: card, error, isLoading } = useCard(tableroId, numero);
  const { data: tablero } = useTablero(tableroId);

  if (error) {
    const prohibido = error instanceof ApiError && error.status === 403;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <Dialog.Title className="font-display text-lg font-semibold text-marino">
          {prohibido ? "No tienes acceso a esta tarjeta" : "No encontramos esta tarjeta"}
        </Dialog.Title>
        <Dialog.Description className="text-sm text-tenue">
          {prohibido ? "Pertenece a un tablero del que no eres miembro." : "Puede que la hayan movido o archivado."}
        </Dialog.Description>
        <Dialog.Close asChild>
          <Boton variante="secundario">Cerrar</Boton>
        </Dialog.Close>
      </div>
    );
  }

  if (isLoading || !card || !tablero) {
    return (
      <div className="space-y-4 p-7">
        <Dialog.Title className="sr-only">Cargando tarjeta</Dialog.Title>
        <Dialog.Description className="sr-only">Cargando</Dialog.Description>
        <Esqueleto className="h-5 w-40" />
        <Esqueleto className="h-9 w-3/4" />
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <Esqueleto className="h-48" />
          <Esqueleto className="h-48" />
        </div>
      </div>
    );
  }

  return <Detalle card={card} tablero={tablero} enlaceTablero={enlaceTablero} onTrasladada={onTrasladada} />;
}

function Detalle({
  card,
  tablero,
  enlaceTablero,
  onTrasladada,
}: {
  card: CardDetalle;
  tablero: TableroDetalle;
  enlaceTablero?: ReactNode;
  onTrasladada?: (card: CardDetalle) => void;
}) {
  const identidad = useIdentidad();
  const patch = usePatchCard(tablero.id);
  const archivar = useArchivarCard(tablero.id);
  const puede = card.permisos.editar && !card.archivada;
  const urgencia = URGENCIAS[card.urgencia];
  const columnaActual = tablero.columnas.find((c) => c.id === card.columna);
  const camposActivos = tablero.campos.filter((c) => !c.archivado);

  const yo: Persona = {
    id: identidad.id,
    nombre: nombreVisible(identidad),
    username: identidad.username,
    email: identidad.email,
    iniciales: iniciales(identidad.first_name, identidad.last_name, identidad.username),
    disciplina: identidad.disciplina,
  };

  function guardar(cambios: CambiosCard) {
    patch.mutate({ card, cambios });
  }

  function cambiarColumna(id: number) {
    if (id === card.columna) return;
    const destino = tablero.columnas.find((c) => c.id === id);
    guardar({ columna: id });
    if (destino?.es_final) toast.success("¡Tarjeta terminada!", { description: card.titulo });
  }

  async function alternarArchivo() {
    const archivada = !card.archivada;
    await archivar.mutateAsync({ card, archivada });
    if (archivada) {
      toast("Tarjeta archivada", {
        description: card.titulo,
        action: { label: "Deshacer", onClick: () => archivar.mutate({ card, archivada: false }) },
      });
    } else {
      toast.success("Tarjeta restaurada");
    }
  }

  return (
    <>
      <div className="h-1.5 shrink-0" style={{ background: `linear-gradient(90deg, ${urgencia.color}, color-mix(in srgb, ${urgencia.color} 30%, #fff))` }} />

      <div className="flex items-start gap-3 px-6 pt-5 sm:px-8">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-tenue">
            {tablero.equipo ? (
              <Pildora color={tablero.equipo.color}>{tablero.equipo.nombre}</Pildora>
            ) : (
              <Pildora>Personal</Pildora>
            )}
            <span className="flex items-center gap-1">
              <LayoutGrid className="size-3.5" />
              {tablero.nombre}
            </span>
            <span className="text-tenue/50">·</span>
            <span>{columnaActual?.nombre ?? card.columna_nombre}</span>
            <span className="font-semibold text-tenue/60">#{card.numero}</span>
            {card.archivada && <Pildora color="#b45309">Archivada</Pildora>}
            {enlaceTablero}
          </div>
          <Titulo key={card.titulo} card={card} puede={puede} onGuardar={(titulo) => guardar({ titulo })} />
        </div>
        <Dialog.Close
          className="mt-0.5 rounded-xl p-2 text-tenue transition-colors hover:bg-morado/8 hover:text-morado"
          aria-label="Cerrar tarjeta"
        >
          <X className="size-5" />
        </Dialog.Close>
      </div>

      <div className="grid flex-1 gap-8 overflow-y-auto px-6 pt-4 pb-8 sm:px-8 md:grid-cols-[minmax(0,1fr)_270px]">
        <div className="min-w-0 space-y-8">
          <Descripcion card={card} puede={puede} onGuardar={(descripcion) => guardar({ descripcion })} />
          <Checklist card={card} tableroId={tablero.id} puede={puede} />
          <Conversacion card={card} tablero={tablero} yo={yo} puede={puede} />
        </div>

        <aside className="space-y-6 md:sticky md:top-0 md:self-start">
          <Seccion titulo="Estado" icono={CircleCheck}>
            <div className="grid gap-1.5">
              {[...tablero.columnas]
                .sort((a, b) => a.orden - b.orden)
                .map((col) => {
                  const activa = col.id === card.columna;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      disabled={!puede}
                      onClick={() => cambiarColumna(col.id)}
                      className={cn(
                        "relative flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors duration-200",
                        activa ? "text-white" : "text-texto hover:bg-columna disabled:hover:bg-transparent",
                      )}
                    >
                      {activa && (
                        <motion.span
                          layoutId={`estado-${card.id}`}
                          className="absolute inset-0 rounded-xl"
                          style={{ background: col.es_final ? "#059669" : "#32407b" }}
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      <span className="relative">
                        {col.es_final ? <CircleCheck className="size-4" /> : <span className="block size-2 rounded-full bg-current opacity-60" />}
                      </span>
                      <span className="relative">{col.nombre}</span>
                    </button>
                  );
                })}
            </div>
          </Seccion>

          <Seccion titulo="Urgencia" icono={Flag}>
            <div className="grid grid-cols-2 gap-1.5">
              {LISTA_URGENCIAS.map((u) => {
                const activa = u === card.urgencia;
                const { etiqueta, color } = URGENCIAS[u];
                return (
                  <button
                    key={u}
                    type="button"
                    disabled={!puede}
                    onClick={() => !activa && guardar({ urgencia: u })}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all duration-200 active:scale-95",
                      activa ? "border-transparent text-white shadow-sm" : "border-linea text-texto hover:border-current",
                    )}
                    style={activa ? { background: color } : { color }}
                  >
                    {!activa && <span className="size-2 rounded-full" style={{ background: color }} />}
                    <span className={activa ? "" : "text-texto"}>{etiqueta}</span>
                  </button>
                );
              })}
            </div>
          </Seccion>

          <Seccion titulo="Etiquetas" icono={Tag}>
            <EtiquetasTarjeta card={card} tablero={tablero} puede={puede} onGuardar={guardar} />
          </Seccion>

          <Seccion titulo="Fechas" icono={CalendarDays}>
            <Fechas card={card} puede={puede} onGuardar={guardar} />
          </Seccion>

          {camposActivos.length > 0 && (
            <Seccion titulo="Campos" icono={Settings2}>
              <CamposTarjeta card={card} campos={camposActivos} puede={puede} onGuardar={guardar} />
            </Seccion>
          )}

          <Seccion titulo="Gantt" icono={ChartGantt}>
            <OpcionGantt card={card} tablero={tablero} puede={puede} onGuardar={(en_gantt) => guardar({ en_gantt })} />
          </Seccion>

          <Seccion titulo="Responsables" icono={UsersRound}>
            <Responsables
              card={card}
              personas={tablero.personas}
              puede={puede}
              onGuardar={(ids) => guardar({ responsables: ids })}
            />
          </Seccion>

          <div className="space-y-3 border-t border-linea/70 pt-5 text-xs text-tenue">
            {card.creada_por && (
              <p>
                Creada por <span className="font-semibold text-texto">{card.creada_por.nombre}</span>{" "}
                {haceCuanto(card.creado_en)}
              </p>
            )}
            <p>Actualizada {haceCuanto(card.actualizado_en)}</p>
            {puede && <MoverATablero card={card} tablero={tablero} onTrasladada={onTrasladada} />}
            {card.permisos.editar && (
              <Boton
                variante={card.archivada ? "suave" : "peligro"}
                tamano="sm"
                className="w-full"
                onClick={() => void alternarArchivo()}
                cargando={archivar.isPending}
              >
                {card.archivada ? <ArchiveRestore /> : <Archive />}
                {card.archivada ? "Restaurar tarjeta" : "Archivar tarjeta"}
              </Boton>
            )}
            {!card.permisos.editar && (
              <p className="rounded-lg bg-fondo px-3 py-2">Tienes acceso de solo lectura en este tablero.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

const OPCIONES_GANTT: { id: EnGantt; etiqueta: string }[] = [
  { id: "heredar", etiqueta: "Según columna" },
  { id: "si", etiqueta: "Sí" },
  { id: "no", etiqueta: "No" },
];

/** Si la tarjeta entra en el Gantt y de qué otras depende. */
function OpcionGantt({
  card,
  tablero,
  puede,
  onGuardar,
}: {
  card: CardDetalle;
  tablero: TableroDetalle;
  puede: boolean;
  onGuardar: (valor: EnGantt) => void;
}) {
  const { data: dependencias = [] } = useDependencias(tablero.id);
  const columna = tablero.columnas.find((c) => c.id === card.columna);
  const titulo = (id: number) => tablero.cards.find((c) => c.id === id)?.titulo ?? `#${id}`;
  const antes = dependencias.filter((d) => d.sucesora === card.id);
  const despues = dependencias.filter((d) => d.predecesora === card.id);
  const sinFechas = !card.fecha_inicio || !card.fecha_fin;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-fondo p-1">
        {OPCIONES_GANTT.map((o) => {
          const activa = card.en_gantt === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={!puede}
              onClick={() => !activa && onGuardar(o.id)}
              className={cn(
                "relative rounded-lg px-1.5 py-1.5 text-[0.72rem] font-semibold transition-colors",
                activa ? "text-morado" : "text-tenue hover:text-morado disabled:hover:text-tenue",
              )}
            >
              {activa && (
                <motion.span
                  layoutId={`gantt-${card.id}`}
                  className="absolute inset-0 rounded-lg bg-white shadow-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{o.etiqueta}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-tenue">
        {card.en_gantt_efectivo
          ? sinFechas
            ? "Entra en el Gantt, pero le faltan fechas: aparece en la bandeja «Sin fechas»."
            : "Aparece en el Gantt."
          : card.en_gantt === "heredar"
            ? `No aparece: la columna ${columna?.nombre ?? ""} está fuera del Gantt.`
            : "No aparece en el Gantt."}
      </p>
      {(antes.length > 0 || despues.length > 0) && (
        <ul className="space-y-1 text-xs">
          {antes.map((d) => (
            <li key={d.id} className={cn("flex gap-1.5", d.incumplida ? "text-[#b91c1c]" : "text-texto")}>
              <span className="shrink-0 text-tenue">Después de</span>
              <span className="truncate font-semibold">{titulo(d.predecesora)}</span>
            </li>
          ))}
          {despues.map((d) => (
            <li key={d.id} className="flex gap-1.5 text-texto">
              <span className="shrink-0 text-tenue">Antes de</span>
              <span className="truncate font-semibold">{titulo(d.sucesora)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function iniciales(nombre: string, apellido: string, usuario: string) {
  const letras = [nombre, apellido].filter(Boolean).map((p) => p[0]).join("");
  return (letras || usuario[0] || "?").toUpperCase().slice(0, 2);
}

function Seccion({ titulo, icono: Icono, children }: { titulo: string; icono: typeof Flag; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-bold tracking-[0.08em] text-tenue uppercase">
        <Icono className="size-3.5" />
        {titulo}
      </h4>
      {children}
    </section>
  );
}

function Titulo({ card, puede, onGuardar }: { card: CardDetalle; puede: boolean; onGuardar: (t: string) => void }) {
  const [valor, setValor] = useState(card.titulo);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [valor]);

  function guardar() {
    const limpio = valor.trim();
    if (!limpio) return setValor(card.titulo);
    if (limpio !== card.titulo) onGuardar(limpio);
  }

  return (
    <>
      <Dialog.Title className="sr-only">{card.titulo}</Dialog.Title>
      <textarea
        ref={ref}
        aria-label="Título de la tarjeta"
        value={valor}
        readOnly={!puede}
        rows={1}
        maxLength={200}
        onChange={(e) => setValor(e.target.value.replace(/\n/g, ""))}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") setValor(card.titulo);
        }}
        className={cn(
          "-mx-2 w-[calc(100%+1rem)] resize-none overflow-hidden rounded-xl border border-transparent bg-transparent px-2 py-1",
          "font-display text-[1.4rem] leading-snug font-semibold tracking-tight text-marino outline-none transition-colors",
          puede && "hover:bg-fondo focus:border-morado/40 focus:bg-white",
        )}
      />
    </>
  );
}

function Descripcion({ card, puede, onGuardar }: { card: CardDetalle; puede: boolean; onGuardar: (d: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(card.descripcion);

  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-2 font-display text-[0.95rem] font-semibold text-marino">
        <TextAlignStart className="size-4 text-morado" />
        Descripción
      </h3>
      <Dialog.Description className="sr-only">Detalle de la tarjeta {card.titulo}</Dialog.Description>
      <AnimatePresence mode="wait" initial={false}>
        {editando ? (
          <motion.div key="editar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            <textarea
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              rows={6}
              maxLength={10000}
              placeholder="Agrega el detalle: alcance, entregables, enlaces…"
              className="w-full resize-y rounded-2xl border border-morado/40 bg-white px-4 py-3 text-sm leading-relaxed text-texto shadow-[0_0_0_4px_rgba(50,64,123,0.08)] outline-none"
            />
            <div className="flex gap-2">
              <Boton
                tamano="sm"
                onClick={() => {
                  if (valor !== card.descripcion) onGuardar(valor);
                  setEditando(false);
                }}
              >
                <Check />
                Guardar
              </Boton>
              <Boton tamano="sm" variante="fantasma" onClick={() => setEditando(false)}>
                Cancelar
              </Boton>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="ver"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            disabled={!puede}
            onClick={() => {
              setValor(card.descripcion);
              setEditando(true);
            }}
            className={cn(
              "w-full rounded-2xl px-4 py-3 text-left text-sm leading-relaxed whitespace-pre-wrap transition-colors",
              card.descripcion ? "text-texto" : "text-tenue/70",
              puede ? "bg-fondo hover:bg-columna" : "bg-fondo cursor-default",
            )}
          >
            {card.descripcion || (puede ? "Añade una descripción más detallada…" : "Sin descripción.")}
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  );
}

function Fechas({ card, puede, onGuardar }: { card: CardDetalle; puede: boolean; onGuardar: (c: CambiosCard) => void }) {
  const [error, setError] = useState("");
  const venc = VENCIMIENTOS[card.vencimiento];

  function cambiar(campo: "fecha_inicio" | "fecha_fin", valor: string) {
    const nuevo = valor || null;
    const inicio = campo === "fecha_inicio" ? nuevo : card.fecha_inicio;
    const fin = campo === "fecha_fin" ? nuevo : card.fecha_fin;
    if (inicio && fin && fin < inicio) {
      setError("La fecha final no puede ser anterior a la de inicio.");
      return;
    }
    setError("");
    onGuardar({ [campo]: nuevo });
  }

  const estiloEntrada =
    "h-9 w-full rounded-xl border border-linea bg-white px-3 text-sm text-texto outline-none transition-shadow focus:border-morado/50 focus:shadow-[0_0_0_4px_rgba(50,64,123,0.08)] disabled:bg-fondo";

  return (
    <div className="space-y-2">
      <label className="grid grid-cols-[3.2rem_1fr] items-center gap-2 text-xs font-medium text-tenue">
        Inicio
        <input type="date" disabled={!puede} value={card.fecha_inicio ?? ""} onChange={(e) => cambiar("fecha_inicio", e.target.value)} className={estiloEntrada} />
      </label>
      <label className="grid grid-cols-[3.2rem_1fr] items-center gap-2 text-xs font-medium text-tenue">
        Fin
        <input type="date" disabled={!puede} value={card.fecha_fin ?? ""} min={card.fecha_inicio ?? undefined} onChange={(e) => cambiar("fecha_fin", e.target.value)} className={estiloEntrada} />
      </label>
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-xs font-medium text-[#dc2626]">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      {card.fecha_fin && venc && (
        <motion.p
          key={card.vencimiento + card.fecha_fin}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold"
          style={{ background: `color-mix(in srgb, ${venc.color} 12%, #fff)`, color: venc.color }}
        >
          {card.vencimiento === "terminada" ? "Terminada" : relativoFin(card.fecha_fin)}
        </motion.p>
      )}
    </div>
  );
}

function Responsables({
  card,
  personas,
  puede,
  onGuardar,
}: {
  card: CardDetalle;
  personas: Persona[];
  puede: boolean;
  onGuardar: (ids: number[]) => void;
}) {
  const ids = card.responsables.map((p) => p.id);

  function alternar(id: number) {
    onGuardar(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {card.responsables.map((p) => (
          <motion.div
            key={p.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8, height: 0 }}
            className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1 hover:bg-fondo"
          >
            <Avatar persona={p} tamano="sm" conTooltip={false} />
            <span className="min-w-0 flex-1 truncate text-sm text-texto">{p.nombre}</span>
            {puede && (
              <button
                type="button"
                onClick={() => alternar(p.id)}
                className="rounded-md p-1 text-tenue opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#dc2626] focus-visible:opacity-100 pointer-coarse:p-2 pointer-coarse:opacity-100"
                aria-label={`Quitar a ${p.nombre}`}
              >
                <X className="size-3.5" />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      {card.responsables.length === 0 && <p className="text-sm text-tenue/70">Sin responsables.</p>}

      {puede && (
        <Popover.Root>
          <Popover.Trigger asChild>
            <Boton variante="suave" tamano="sm" className="w-full">
              <Plus />
              Asignar
            </Boton>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              className="flotante z-[60] w-64 rounded-xl border border-linea bg-white p-1.5 shadow-[0_18px_38px_-18px_rgba(20,22,68,0.4)]"
            >
              <p className="px-2.5 pt-1.5 pb-2 text-[0.7rem] font-bold tracking-wide text-tenue uppercase">
                Personas del tablero
              </p>
              <div className="max-h-64 overflow-y-auto">
                {personas.map((p) => {
                  const activo = ids.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => alternar(p.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-morado/8"
                    >
                      <Avatar persona={p} tamano="sm" conTooltip={false} />
                      <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-md border transition-all duration-200",
                          activo ? "border-morado bg-morado text-white" : "border-linea",
                        )}
                      >
                        {activo && <Check className="check-burst size-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}

function Conversacion({
  card,
  tablero,
  yo,
  puede,
}: {
  card: CardDetalle;
  tablero: TableroDetalle;
  yo: Persona;
  puede: boolean;
}) {
  const [pestana, setPestana] = useState<"comentarios" | "actividad">("comentarios");
  const pestanas = [
    { id: "comentarios" as const, etiqueta: "Comentarios", icono: MessageSquare, contador: card.comentarios },
    { id: "actividad" as const, etiqueta: "Actividad", icono: History, contador: 0 },
  ];
  return (
    <section>
      <div className="mb-4 flex gap-1 border-b border-linea" role="tablist">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={cn(
              "relative flex items-center gap-2 px-3 pb-2.5 font-display text-[0.92rem] font-semibold transition-colors",
              pestana === p.id ? "text-marino" : "text-tenue hover:text-morado",
            )}
          >
            <p.icono className="size-4" />
            {p.etiqueta}
            {p.contador > 0 && (
              <span className="rounded-full bg-columna px-1.5 py-0.5 text-[0.68rem] text-tenue">{p.contador}</span>
            )}
            {pestana === p.id && (
              <motion.span
                layoutId={`conversacion-${card.id}`}
                className="absolute inset-x-1 -bottom-px h-[3px] rounded-full bg-morado"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pestana}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {pestana === "comentarios" ? (
            <Comentarios tableroId={tablero.id} cardId={card.id} yo={yo} puedeComentar={puede} personas={tablero.personas} />
          ) : (
            <Historial cardId={card.id} />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/** Llevar la tarjeta a otro tablero: desde uno personal, a otro personal o a uno
 *  de equipo; desde uno de equipo, solo a otro de equipo (lo exige el backend). */
function MoverATablero({
  card,
  tablero,
  onTrasladada,
}: {
  card: CardDetalle;
  tablero: TableroDetalle;
  onTrasladada?: (card: CardDetalle) => void;
}) {
  const { data: tableros } = useTableros();
  const trasladar = useTrasladarCard(tablero.id);
  const [abierto, setAbierto] = useState(false);
  const destinos = (tableros ?? []).filter(
    (t) => t.id !== tablero.id && t.permisos.editar && (t.tipo === "equipo" || tablero.tipo === "personal"),
  );
  if (!destinos.length) return null;

  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger asChild>
        <Boton variante="secundario" tamano="sm" className="w-full">
          <ArrowRightLeft />
          Mover a otro tablero
        </Boton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="top"
          sideOffset={6}
          className="flotante z-[60] w-72 rounded-xl border border-linea bg-white p-1.5 shadow-[0_18px_38px_-18px_rgba(20,22,68,0.4)]"
        >
          <p className="px-2.5 pt-1.5 pb-2 text-[0.7rem] leading-snug text-tenue">
            La tarjeta se lleva sus comentarios, checklist e historial. Quedarán como responsables solo quienes
            tengan acceso al tablero destino.
          </p>
          <div className="max-h-64 overflow-y-auto">
            {destinos.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={trasladar.isPending}
                onClick={() =>
                  trasladar.mutate(
                    { cardId: card.id, tablero: t.id },
                    {
                      onSuccess: (movida) => {
                        setAbierto(false);
                        toast.success("Tarjeta trasladada", { description: `Ahora está en ${t.nombre}.` });
                        onTrasladada?.(movida);
                      },
                    },
                  )
                }
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-morado/8 disabled:opacity-50"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.equipo?.color ?? "#32407b" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-texto">{t.nombre}</span>
                  <span className="block truncate text-[0.72rem] text-tenue">{t.equipo?.nombre ?? "Personal"}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
