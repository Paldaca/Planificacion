import {
  closestCenter,
  closestCorners,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CircleCheck, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  moverEnCache,
  reordenarEnCache,
  useCrearCard,
  useCrearColumna,
  useEditarColumna,
  useMoverCard,
  useReordenarColumnas,
} from "@/api/queries";
import type { CardResumen, Columna, TableroDetalle } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { cn } from "@/lib/cn";

import { ArchivarColumnaDialogo } from "./ArchivarColumnaDialogo";
import { ColumnaKanban } from "./ColumnaKanban";
import { LimiteColumnaDialogo } from "./LimiteColumnaDialogo";
import { CuerpoTarjeta } from "./Tarjeta";

type Activo = { tipo: "card"; card: CardResumen } | { tipo: "columna"; columna: Columna } | null;

const porOrden = (a: { orden: number; id: number }, b: { orden: number; id: number }) =>
  a.orden - b.orden || a.id - b.id;

const idNum = (id: UniqueIdentifier) => Number(String(id).slice(2));

const animacionSoltar: DropAnimation = {
  duration: 260,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.35" } } }),
};

/** Colisiones: una columna solo compite con columnas; una tarjeta prefiere la
 *  tarjeta bajo el puntero, luego la zona de la columna, luego la más cercana. */
const colision: CollisionDetection = (args) => {
  const esColumna = args.active.data.current?.tipo === "columna";
  const candidatos = args.droppableContainers.filter((d) => String(d.id).startsWith("k:") === esColumna);
  if (esColumna) return closestCenter({ ...args, droppableContainers: candidatos });
  const dentro = pointerWithin({ ...args, droppableContainers: candidatos });
  if (dentro.length) {
    const tarjeta = dentro.find((c) => String(c.id).startsWith("c:"));
    return tarjeta ? [tarjeta] : dentro;
  }
  // Las pastillas del teléfono solo cuentan con el dedo encima: por cercanía
  // podrían ganar al pasar por la cabecera de una columna.
  return closestCorners({ ...args, droppableContainers: candidatos.filter((d) => !String(d.id).startsWith("p:")) });
};

export function Kanban({
  tablero,
  visibles,
  filtrando,
  onAbrir,
}: {
  tablero: TableroDetalle;
  visibles: CardResumen[];
  filtrando: boolean;
  onAbrir: (card: CardResumen) => void;
}) {
  const qc = useQueryClient();
  const mover = useMoverCard(tablero.id);
  const reordenar = useReordenarColumnas(tablero.id);
  const crearCard = useCrearCard(tablero.id);
  const crearColumna = useCrearColumna(tablero.id);
  const editarColumna = useEditarColumna(tablero.id);

  const { editar, gestionar } = tablero.permisos;
  const columnas = useMemo(() => [...tablero.columnas].sort(porOrden), [tablero.columnas]);
  const porId = useMemo(() => new Map(tablero.cards.map((c) => [c.id, c])), [tablero.cards]);

  const agrupadas = useMemo(() => {
    const grupos: Record<number, number[]> = {};
    for (const col of columnas) grupos[col.id] = [];
    for (const card of [...visibles].sort(porOrden)) grupos[card.columna]?.push(card.id);
    return grupos;
  }, [columnas, visibles]);

  const [activo, setActivo] = useState<Activo>(null);
  const [items, setItems] = useState<Record<number, number[]>>(agrupadas);
  const [ordenCols, setOrdenCols] = useState<number[]>([]);
  const [nuevas, setNuevas] = useState<Set<number>>(new Set());
  const [archivando, setArchivando] = useState<Columna | null>(null);
  const [limitando, setLimitando] = useState<Columna | null>(null);
  const ultimoArrastre = useRef(0);
  const carril = useRef<HTMLDivElement>(null);
  /** Columna a la vista en el teléfono (una por pantalla). */
  const [enVista, setEnVista] = useState<number | null>(null);

  /** Tarjetas por columna sin filtros: el límite (fase 5) cuenta todas. */
  const totales = useMemo(() => {
    const cuenta = new Map<number, number>();
    for (const c of tablero.cards) cuenta.set(c.columna, (cuenta.get(c.columna) ?? 0) + 1);
    return cuenta;
  }, [tablero.cards]);

  /** Límite suave (D-13): avisa si con una tarjeta más se pasa, no bloquea. */
  function avisarSiSePasa(columnaId: number) {
    const columna = columnas.find((c) => c.id === columnaId);
    const limite = columna?.limite_cards;
    if (!columna || !limite) return;
    if ((totales.get(columnaId) ?? 0) + 1 > limite) {
      toast.warning(`«${columna.nombre}» pasó su límite de ${limite} tarjetas`, {
        description: "Conviene terminar alguna antes de sumar más.",
      });
    }
  }

  // Mientras se arrastra manda el estado local; en reposo, la caché del servidor.
  const vista = activo?.tipo === "card" ? items : agrupadas;
  const idsColumnas = activo?.tipo === "columna" ? ordenCols : columnas.map((c) => c.id);

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const contenedor = useCallback(
    (id: UniqueIdentifier | undefined, estado: Record<number, number[]>): number | undefined => {
      if (id === undefined) return undefined;
      const texto = String(id);
      if (texto.startsWith("z:") || texto.startsWith("k:") || texto.startsWith("p:")) return idNum(id);
      const cardId = idNum(id);
      const clave = Object.keys(estado).find((k) => estado[Number(k)].includes(cardId));
      return clave === undefined ? undefined : Number(clave);
    },
    [],
  );

  function alIniciar({ active }: DragStartEvent) {
    const datos = active.data.current;
    if (datos?.tipo === "card") {
      setItems(agrupadas);
      setActivo({ tipo: "card", card: datos.card as CardResumen });
    } else if (datos?.tipo === "columna") {
      setOrdenCols(columnas.map((c) => c.id));
      setActivo({ tipo: "columna", columna: datos.columna as Columna });
    }
  }

  function alPasarSobre({ active, over }: DragOverEvent) {
    if (activo?.tipo !== "card" || !over) return;
    setItems((prev) => {
      const desde = contenedor(active.id, prev);
      const hacia = contenedor(over.id, prev);
      if (desde === undefined || hacia === undefined || desde === hacia) return prev;
      const cardId = idNum(active.id);
      const destino = prev[hacia].filter((id) => id !== cardId);
      const sobreTarjeta = String(over.id).startsWith("c:");
      const indice = sobreTarjeta ? destino.indexOf(idNum(over.id)) : destino.length;
      destino.splice(indice < 0 ? destino.length : indice, 0, cardId);
      return { ...prev, [desde]: prev[desde].filter((id) => id !== cardId), [hacia]: destino };
    });
  }

  function alSoltar({ active, over }: DragEndEvent) {
    ultimoArrastre.current = Date.now();
    const actual = activo;
    setActivo(null);
    if (!actual || !over) return;

    if (actual.tipo === "columna") {
      const hacia = contenedor(over.id, items) ?? idNum(over.id);
      const desdeIdx = ordenCols.indexOf(actual.columna.id);
      const haciaIdx = ordenCols.indexOf(hacia);
      if (desdeIdx < 0 || haciaIdx < 0 || desdeIdx === haciaIdx) return;
      const nuevo = arrayMove(ordenCols, desdeIdx, haciaIdx);
      reordenarEnCache(qc, tablero.id, nuevo);
      reordenar.mutate(nuevo);
      return;
    }

    const cardId = actual.card.id;
    const hacia = contenedor(active.id, items);
    if (hacia === undefined) return;
    let lista = items[hacia];
    if (String(over.id).startsWith("c:") && contenedor(over.id, items) === hacia) {
      lista = arrayMove(lista, lista.indexOf(cardId), lista.indexOf(idNum(over.id)));
    }

    // Posición en la columna COMPLETA (con filtros, parte de las tarjetas no
    // se ve): se ubica respecto de la vecina visible más próxima.
    const completas = tablero.cards
      .filter((c) => c.columna === hacia && c.id !== cardId)
      .sort(porOrden)
      .map((c) => c.id);
    const i = lista.indexOf(cardId);
    const siguiente = lista[i + 1];
    const anterior = lista[i - 1];
    const posicion =
      siguiente !== undefined
        ? completas.indexOf(siguiente)
        : anterior !== undefined
          ? completas.indexOf(anterior) + 1
          : completas.length;

    const original = porId.get(cardId);
    if (original && original.columna === hacia) {
      const antes = tablero.cards
        .filter((c) => c.columna === hacia)
        .sort(porOrden)
        .map((c) => c.id)
        .indexOf(cardId);
      if (antes === posicion) return;
    }
    if (original && original.columna !== hacia) avisarSiSePasa(hacia);
    // Síncrono: la tarjeta queda donde se soltó sin un fotograma de rebote.
    moverEnCache(qc, tablero.id, cardId, hacia, posicion);
    mover.mutate({ cardId, columna: hacia, posicion });
  }

  const abrir = useCallback(
    (card: CardResumen) => {
      if (Date.now() - ultimoArrastre.current < 250) return;
      onAbrir(card);
    },
    [onAbrir],
  );

  async function crear(columnaId: number, titulo: string) {
    const card = await crearCard.mutateAsync({ titulo, columna: columnaId });
    avisarSiSePasa(columnaId);
    setNuevas((s) => new Set(s).add(card.id));
    window.setTimeout(
      () =>
        setNuevas((s) => {
          const copia = new Set(s);
          copia.delete(card.id);
          return copia;
        }),
      800,
    );
  }

  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Tomaste ${descripcion(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${descripcion(active.id)} está sobre ${descripcion(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Soltaste ${descripcion(active.id)} en ${descripcion(over.id)}.` : `Soltaste ${descripcion(active.id)}.`,
    onDragCancel: ({ active }) => `Se canceló el movimiento de ${descripcion(active.id)}.`,
  };

  function descripcion(id: UniqueIdentifier): string {
    const texto = String(id);
    if (texto.startsWith("c:")) return `la tarjeta «${porId.get(idNum(id))?.titulo ?? ""}»`;
    const col = columnas.find((c) => c.id === idNum(id));
    return `la columna «${col?.nombre ?? ""}»`;
  }

  const mapaColumnas = new Map(columnas.map((c) => [c.id, c]));

  /** En el teléfono: qué columna ocupa la pantalla según el desplazamiento. */
  const medirEnVista = useCallback(() => {
    const el = carril.current;
    if (!el) return;
    let mejor: number | null = null;
    let distancia = Infinity;
    for (const hijo of el.querySelectorAll<HTMLElement>("[data-columna]")) {
      const d = Math.abs(hijo.offsetLeft - el.offsetLeft - el.scrollLeft);
      if (d < distancia) {
        distancia = d;
        mejor = Number(hijo.dataset.columna);
      }
    }
    setEnVista(mejor);
  }, []);
  useEffect(medirEnVista, [medirEnVista, columnas.length]);

  function irAColumna(id: number) {
    const el = carril.current;
    const destino = el?.querySelector<HTMLElement>(`[data-columna="${id}"]`);
    if (el && destino) el.scrollTo({ left: destino.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }

  return (
    <>
      <DndContext
        sensors={sensores}
        collisionDetection={colision}
        onDragStart={alIniciar}
        onDragOver={alPasarSobre}
        onDragEnd={alSoltar}
        onDragCancel={() => setActivo(null)}
        accessibility={{
          announcements: anuncios,
          screenReaderInstructions: {
            draggable:
              "Para tomar una tarjeta, pulsa Espacio o Enter. Muévela con las flechas y suéltala con Espacio o Enter. Escape cancela.",
          },
        }}
      >
        <IndiceColumnas
          columnas={idsColumnas.map((id) => mapaColumnas.get(id)).filter((c): c is Columna => Boolean(c))}
          cuentas={vista}
          enVista={enVista}
          arrastrando={activo?.tipo === "card"}
          onIr={irAColumna}
        />
        <div
          ref={carril}
          onScroll={medirEnVista}
          className={cn(
            "kanban-scroll -mx-1 flex h-[calc(100dvh-15.5rem)] min-h-[420px] snap-x items-start gap-3.5 overflow-x-auto scroll-px-1 px-1 pb-4",
            // Teléfono: una columna por pantalla y cada deslizamiento para en la
            // siguiente. Mientras se arrastra, sin imán: si no, el desplazamiento
            // automático de dnd-kit hacia el borde pelea con él.
            "max-sm:h-[calc(100dvh-13rem)] max-sm:min-h-[360px] max-sm:gap-3",
            activo?.tipo === "card" ? "max-sm:snap-none" : "max-sm:snap-mandatory",
          )}
        >
          <SortableContext items={idsColumnas.map((id) => `k:${id}`)} strategy={horizontalListSortingStrategy}>
            {idsColumnas.map((id, indice) => {
              const columna = mapaColumnas.get(id);
              if (!columna) return null;
              const cards = (vista[id] ?? []).map((cid) => porId.get(cid)).filter((c): c is CardResumen => Boolean(c));
              return (
                <ColumnaKanban
                  key={id}
                  columna={columna}
                  cards={cards}
                  indice={indice}
                  puedeEditar={editar}
                  puedeGestionar={gestionar}
                  arrastreTarjetas={editar}
                  nuevas={nuevas}
                  onAbrir={abrir}
                  onCrear={crear}
                  creando={crearCard.isPending}
                  onRenombrar={(col, nombre) => editarColumna.mutate({ id: col.id, cambios: { nombre } })}
                  onAlternarFinal={(col) => editarColumna.mutate({ id: col.id, cambios: { es_final: !col.es_final } })}
                  onAlternarGantt={(col) =>
                    editarColumna.mutate({ id: col.id, cambios: { incluir_en_gantt: !col.incluir_en_gantt } })
                  }
                  onLimite={setLimitando}
                  total={totales.get(id) ?? 0}
                  onArchivar={setArchivando}
                />
              );
            })}
          </SortableContext>

          {gestionar && (
            <NuevaColumna
              onCrear={async (nombre) => {
                await crearColumna.mutateAsync(nombre);
                // En el teléfono la nueva queda fuera de la pantalla: se lleva a la vista.
                window.setTimeout(() => {
                  const el = carril.current;
                  if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
                }, 50);
              }}
            />
          )}
        </div>

        <DragOverlay dropAnimation={animacionSoltar}>
          {activo?.tipo === "card" ? (
            <div className="tarjeta-arrastrada w-[min(80vw,276px)] rounded-[14px]">
              <CuerpoTarjeta card={porId.get(activo.card.id) ?? activo.card} />
            </div>
          ) : activo?.tipo === "columna" ? (
            <div className="tarjeta-arrastrada flex w-[min(85vw,300px)] items-center gap-2 rounded-[18px] bg-columna px-4 py-3.5 font-display font-semibold text-marino">
              {activo.columna.nombre}
              <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-tenue">
                {(agrupadas[activo.columna.id] ?? []).length}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {filtrando && editar && (
        <p className="-mt-2 text-xs text-tenue/80">
          Hay filtros activos: al mover una tarjeta se ubica junto a las que ves.
        </p>
      )}

      <LimiteColumnaDialogo
        tableroId={tablero.id}
        columna={limitando}
        total={limitando ? (totales.get(limitando.id) ?? 0) : 0}
        onCerrar={() => setLimitando(null)}
      />

      <ArchivarColumnaDialogo
        tablero={tablero}
        columna={archivando}
        onCerrar={() => setArchivando(null)}
      />
    </>
  );
}

/**
 * Teléfono: los nombres de las columnas sobre el tablero, con la que está a la
 * vista resaltada. Tocar uno lleva a esa columna; mientras se arrastra una
 * tarjeta, soltarla sobre un nombre la deja al final de esa columna (sin tener
 * que arrastrarla de pantalla en pantalla).
 */
function IndiceColumnas({
  columnas,
  cuentas,
  enVista,
  arrastrando,
  onIr,
}: {
  columnas: Columna[];
  cuentas: Record<number, number[]>;
  enVista: number | null;
  arrastrando: boolean;
  onIr: (id: number) => void;
}) {
  const tira = useRef<HTMLDivElement>(null);

  // La pastilla activa siempre a la vista dentro de la tira.
  useEffect(() => {
    const contenedor = tira.current;
    const el = contenedor?.querySelector<HTMLElement>(`[data-pastilla="${enVista}"]`);
    if (!contenedor || !el) return;
    const izquierda = el.offsetLeft - contenedor.offsetLeft;
    if (izquierda < contenedor.scrollLeft || izquierda + el.offsetWidth > contenedor.scrollLeft + contenedor.clientWidth) {
      contenedor.scrollTo({ left: izquierda - 16, behavior: "smooth" });
    }
  }, [enVista]);

  if (columnas.length < 2) return null;
  return (
    <div className="sm:hidden">
      <div
        ref={tira}
        className="-mx-4 mb-2.5 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        role="tablist"
        aria-label="Columnas"
      >
        {columnas.map((col) => (
          <PastillaColumna
            key={col.id}
            columna={col}
            cuenta={(cuentas[col.id] ?? []).length}
            activa={col.id === enVista}
            arrastrando={arrastrando}
            onIr={() => onIr(col.id)}
          />
        ))}
      </div>
      {arrastrando && (
        <p className="-mt-1 mb-2 text-center text-[0.72rem] font-medium text-morado">
          Suelta sobre una columna para llevarla allí
        </p>
      )}
    </div>
  );
}

function PastillaColumna({
  columna,
  cuenta,
  activa,
  arrastrando,
  onIr,
}: {
  columna: Columna;
  cuenta: number;
  activa: boolean;
  arrastrando: boolean;
  onIr: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `p:${columna.id}`, data: { tipo: "pastilla", columnaId: columna.id } });
  const resaltada = activa && !isOver;
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={activa}
      data-pastilla={columna.id}
      onClick={onIr}
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-all duration-200",
        resaltada ? "border-morado bg-morado text-white" : "border-linea bg-white text-texto",
        arrastrando && !isOver && "border-dashed border-morado/50",
        isOver && "scale-105 border-morado bg-[#e6e9f7] text-morado",
      )}
    >
      {columna.es_final && <CircleCheck className={cn("size-3.5", resaltada ? "text-white" : "text-[#059669]")} />}
      <span className="max-w-[9rem] truncate">{columna.nombre}</span>
      <span
        className={cn("rounded-full px-1.5 text-[0.7rem] tabular-nums", resaltada ? "bg-white/20 text-white" : "bg-columna text-tenue")}
      >
        {cuenta}
      </span>
    </button>
  );
}

function NuevaColumna({ onCrear }: { onCrear: (nombre: string) => Promise<unknown> }) {
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const limpio = nombre.trim();
    if (!limpio) return setAbierta(false);
    setGuardando(true);
    try {
      await onCrear(limpio);
      setNombre("");
      setAbierta(false);
    } finally {
      setGuardando(false);
    }
  }

  if (!abierta) {
    return (
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="group flex w-[min(85vw,280px)] shrink-0 snap-start items-center max-sm:w-full gap-2 rounded-[18px] border-2 border-dashed border-linea px-4 py-3.5 text-sm font-medium text-tenue transition-all duration-200 hover:border-morado/40 hover:bg-white hover:text-morado"
      >
        <Plus className="size-4 transition-transform duration-200 group-hover:rotate-90" />
        Añadir columna
      </button>
    );
  }
  return (
    <div className="w-[min(85vw,280px)] shrink-0 snap-start animate-pop max-sm:w-full space-y-2 rounded-[18px] bg-columna/80 p-3">
      <input
        autoFocus
        value={nombre}
        maxLength={60}
        placeholder="Nombre de la columna"
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void guardar();
          if (e.key === "Escape") setAbierta(false);
        }}
        className="w-full rounded-xl border border-morado/30 bg-white px-3 py-2 text-sm outline-none focus:shadow-[0_0_0_4px_rgba(50,64,123,0.1)]"
      />
      <div className="flex gap-2">
        <Boton tamano="sm" onClick={() => void guardar()} cargando={guardando}>
          Crear
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierta(false)}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}
