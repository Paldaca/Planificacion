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
import { Plus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

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

import { ArchivarColumnaDialogo } from "./ArchivarColumnaDialogo";
import { ColumnaKanban } from "./ColumnaKanban";
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
  return closestCorners({ ...args, droppableContainers: candidatos });
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
  const ultimoArrastre = useRef(0);

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
      if (texto.startsWith("z:") || texto.startsWith("k:")) return idNum(id);
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
        <div className="kanban-scroll -mx-1 flex h-[calc(100vh-15.5rem)] min-h-[420px] snap-x items-start gap-3.5 overflow-x-auto px-1 pb-4">
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
                  onArchivar={setArchivando}
                />
              );
            })}
          </SortableContext>

          {gestionar && <NuevaColumna onCrear={(nombre) => crearColumna.mutateAsync(nombre)} />}
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

      <ArchivarColumnaDialogo
        tablero={tablero}
        columna={archivando}
        onCerrar={() => setArchivando(null)}
      />
    </>
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
        className="group flex w-[min(85vw,280px)] shrink-0 items-center gap-2 rounded-[18px] border-2 border-dashed border-linea px-4 py-3.5 text-sm font-medium text-tenue transition-all duration-200 hover:border-morado/40 hover:bg-white hover:text-morado"
      >
        <Plus className="size-4 transition-transform duration-200 group-hover:rotate-90" />
        Añadir columna
      </button>
    );
  }
  return (
    <div className="w-[min(85vw,280px)] shrink-0 animate-pop space-y-2 rounded-[18px] bg-columna/80 p-3">
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
