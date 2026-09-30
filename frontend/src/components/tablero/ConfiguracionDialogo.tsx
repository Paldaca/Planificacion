import { Archive, ArchiveRestore, ChevronDown, Eye, EyeOff, Hash, List, Plus, Settings2, Tag, Trash2, Type } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  useCrearCampo,
  useCrearEtiqueta,
  useEditarCampo,
  useEditarEtiqueta,
  useEliminarEtiqueta,
} from "@/api/configuracion";
import type { CampoPersonalizado, Etiqueta, TableroDetalle, TipoCampo } from "@/api/tipos";
import { BotonAyuda, SeccionAyuda } from "@/components/ayuda/BotonAyuda";
import { SelectorColor } from "@/components/equipos/Dialogos";
import { Boton } from "@/components/ui/Boton";
import { Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { Pildora } from "@/components/ui/Estados";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";
import { COLORES_EQUIPO } from "@/lib/estilos";
import { MAX_OPCIONES, opcionesDeTexto } from "@/lib/opciones";

import { EditorOpciones } from "./EditorOpciones";

const TIPOS: Record<TipoCampo, { etiqueta: string; icono: typeof Type }> = {
  texto: { etiqueta: "Texto", icono: Type },
  numero: { etiqueta: "Número", icono: Hash },
  lista: { etiqueta: "Lista", icono: List },
};

/**
 * Configuración del tablero (fase 5): etiquetas y campos personalizados.
 * Solo quien gestiona el tablero (lo mismo que las columnas).
 */
export function ConfiguracionDialogo({
  tablero,
  abierto,
  onCerrar,
}: {
  tablero: TableroDetalle;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const [pestana, setPestana] = useState<"etiquetas" | "campos">("etiquetas");
  useAlAbrir(abierto, () => setPestana("etiquetas"));

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Etiquetas y campos"
      descripcion="Organiza las tarjetas de este tablero con etiquetas y datos propios."
      icono={Settings2}
      ancho="lg"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-xl bg-fondo p-1" role="tablist">
          {(
            [
              ["etiquetas", "Etiquetas", "", Tag, tablero.etiquetas.length],
              // En el teléfono no cabe el nombre largo junto a «Etiquetas».
              ["campos", "Campos", " personalizados", Settings2, tablero.campos.filter((c) => !c.archivado).length],
            ] as const
          ).map(([id, texto, resto, Icono, cantidad]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                pestana === id ? "text-morado" : "text-tenue hover:text-morado",
              )}
            >
              {pestana === id && (
                <motion.span layoutId="pestana-config" className="absolute inset-0 rounded-lg bg-white shadow-sm" />
              )}
              <Icono className="relative size-4" />
              <span className="relative">
                {texto}
                {resto && <span className="max-sm:hidden">{resto}</span>}
              </span>
              <span className="relative rounded-full bg-columna px-1.5 text-[0.7rem] tabular-nums">{cantidad}</span>
            </button>
          ))}
        </div>
        {pestana === "etiquetas" ? <AyudaEtiquetas /> : <AyudaCampos />}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pestana}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {pestana === "etiquetas" ? <Etiquetas tablero={tablero} /> : <Campos tablero={tablero} />}
        </motion.div>
      </AnimatePresence>
    </Dialogo>
  );
}

function AyudaEtiquetas() {
  return (
    <BotonAyuda etiqueta="¿Para qué sirven las etiquetas?" titulo="Etiquetas" align="end" guia={{ tema: "tablero", entrada: "etiquetas" }}>
      <p>
        Una marca de color con nombre para <b>clasificar</b> las tarjetas y saber de un vistazo de qué se tratan. Una tarjeta puede tener
        varias.
      </p>
      <SeccionAyuda titulo="Ejemplos">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>Disciplina: Civil, Mecánica, Eléctrica.</li>
          <li>Cliente o proyecto: Cliente A, Planta Norte.</li>
          <li>Fase: Ingeniería, Procura, Construcción.</li>
          <li>Estados que no son columnas: Bloqueada, Espera cliente.</li>
        </ul>
      </SeccionAyuda>
      <SeccionAyuda titulo="Para qué sirven">
        <p>Se ven en el Tablero y en la Lista, y con el filtro «Etiquetas» ves solo lo de una (también al exportar a Excel).</p>
      </SeccionAyuda>
      <p className="text-xs text-tenue">
        Créalas aquí (hasta 30) y márcalas dentro de cada tarjeta con un clic. Borrar una la quita de todas sus tarjetas.
      </p>
    </BotonAyuda>
  );
}

function AyudaCampos() {
  return (
    <BotonAyuda
      etiqueta="¿Para qué sirven los campos personalizados?"
      titulo="Campos personalizados"
      align="end"
      guia={{ tema: "tablero", entrada: "campos" }}
    >
      <p>
        Un <b>dato propio</b> que tu tablero necesita y la tarjeta no trae: lo defines una vez aquí y cada tarjeta guarda su valor.
      </p>
      <SeccionAyuda titulo="Tipos y ejemplos">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>
            <b>Texto</b>: N.º de plano (PLN-CIV-0012), orden de compra.
          </li>
          <li>
            <b>Número</b>: horas estimadas, monto, cantidad.
          </li>
          <li>
            <b>Lista</b>: Etapa (Básica, Detalle, Construcción), Revisión (A, B, 0).
          </li>
        </ul>
      </SeccionAyuda>
      <SeccionAyuda titulo="Para qué sirven">
        <p>
          Cada campo tiene su columna en la Lista (se puede ordenar) y sale en el Excel. Con «Se ve en la tarjeta del tablero» también aparece
          en el Kanban.
        </p>
      </SeccionAyuda>
      <p className="text-xs text-tenue">
        ¿Etiqueta o campo? Etiqueta para clasificar y filtrar («Mecánica»); campo para guardar un dato («Horas: 16»). El tipo de un campo no
        cambia después; se archiva sin perder sus valores.
      </p>
    </BotonAyuda>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-fondo p-4">
      <p className="mb-3 text-sm font-semibold text-marino">{titulo}</p>
      {children}
    </div>
  );
}

// --- Etiquetas -------------------------------------------------------------------------

function Etiquetas({ tablero }: { tablero: TableroDetalle }) {
  const crear = useCrearEtiqueta(tablero.id);
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES_EQUIPO[1]);
  const usos = new Map<number, number>();
  for (const c of tablero.cards) for (const e of c.etiquetas) usos.set(e, (usos.get(e) ?? 0) + 1);

  function agregar() {
    if (!nombre.trim()) return;
    crear.mutate({ nombre: nombre.trim(), color }, { onSuccess: () => setNombre("") });
  }

  return (
    <div className="space-y-4">
      {tablero.etiquetas.length ? (
        <ul className="divide-y divide-linea/70 rounded-xl border border-linea">
          <AnimatePresence initial={false}>
            {tablero.etiquetas.map((e) => (
              <FilaEtiqueta key={e.id} tableroId={tablero.id} etiqueta={e} usos={usos.get(e.id) ?? 0} />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-linea px-4 py-5 text-center text-sm text-tenue">
          Aún no hay etiquetas. Sirven para marcar disciplina, cliente o tipo de trabajo, y filtrar por ellas.
        </p>
      )}
      <Seccion titulo="Nueva etiqueta">
        <div className="space-y-3">
          <Entrada
            value={nombre}
            maxLength={40}
            placeholder="Ej.: Civil, Mecánica, Cliente A"
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SelectorColor valor={color} onCambio={setColor} />
            <Boton tamano="sm" disabled={!nombre.trim()} cargando={crear.isPending} onClick={agregar}>
              <Plus />
              Agregar
            </Boton>
          </div>
        </div>
      </Seccion>
    </div>
  );
}

function FilaEtiqueta({ tableroId, etiqueta, usos }: { tableroId: number; etiqueta: Etiqueta; usos: number }) {
  const editar = useEditarEtiqueta(tableroId);
  const eliminar = useEliminarEtiqueta(tableroId);
  const [nombre, setNombre] = useState(etiqueta.nombre);
  const [confirmar, setConfirmar] = useState(false);
  const [paleta, setPaleta] = useState(false);

  function guardarNombre() {
    const limpio = nombre.trim();
    if (!limpio) setNombre(etiqueta.nombre);
    else if (limpio !== etiqueta.nombre) editar.mutate({ id: etiqueta.id, cambios: { nombre: limpio } });
  }

  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="px-3 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Cambiar color de ${etiqueta.nombre}`}
          onClick={() => setPaleta((v) => !v)}
          className="size-6 shrink-0 rounded-md ring-offset-2 transition-transform hover:scale-110 focus-visible:ring-2"
          style={{ background: etiqueta.color }}
        />
        <input
          value={nombre}
          maxLength={40}
          aria-label="Nombre de la etiqueta"
          onChange={(e) => setNombre(e.target.value)}
          onBlur={guardarNombre}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-texto outline-none hover:border-linea focus:border-morado/40"
        />
        <span className="text-xs text-tenue tabular-nums">{usos === 1 ? "1 tarjeta" : `${usos} tarjetas`}</span>
        {confirmar ? (
          <Boton
            variante="peligro"
            tamano="sm"
            cargando={eliminar.isPending}
            onClick={() =>
              eliminar.mutate(etiqueta.id, { onSuccess: () => toast("Etiqueta eliminada", { description: etiqueta.nombre }) })
            }
          >
            ¿Quitar{usos ? ` de ${usos}` : ""}?
          </Boton>
        ) : (
          <button
            type="button"
            aria-label={`Eliminar ${etiqueta.nombre}`}
            onClick={() => setConfirmar(true)}
            onBlur={() => window.setTimeout(() => setConfirmar(false), 200)}
            className="rounded-lg p-1.5 text-tenue transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626]"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {paleta && (
        <div className="mt-2 pl-9">
          <SelectorColor
            valor={etiqueta.color}
            onCambio={(c) => {
              setPaleta(false);
              editar.mutate({ id: etiqueta.id, cambios: { color: c } });
            }}
          />
        </div>
      )}
    </motion.li>
  );
}

// --- Campos personalizados -------------------------------------------------------------

function Campos({ tablero }: { tablero: TableroDetalle }) {
  const crear = useCrearCampo(tablero.id);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCampo>("texto");
  const [opciones, setOpciones] = useState<string[]>([]);
  /** Lo escrito en «Añadir opción» sin pulsar Enter: también cuenta al crear el campo. */
  const [borrador, setBorrador] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const activos = tablero.campos.filter((c) => !c.archivado);
  const archivados = tablero.campos.filter((c) => c.archivado);
  const todas = [...new Set([...opciones, ...opcionesDeTexto(borrador)])].slice(0, MAX_OPCIONES);
  const valido = nombre.trim() && (tipo !== "lista" || todas.length > 0);
  // Cuántas tarjetas tienen cada opción de cada lista: para avisar antes de quitar una.
  const usos = useMemo(() => {
    const porCampo = new Map<number, Map<string, number>>();
    for (const campo of tablero.campos) {
      if (campo.tipo !== "lista") continue;
      const cuenta = new Map<string, number>();
      for (const card of tablero.cards) {
        const valor = card.campos[String(campo.id)];
        if (valor !== undefined) cuenta.set(String(valor), (cuenta.get(String(valor)) ?? 0) + 1);
      }
      porCampo.set(campo.id, cuenta);
    }
    return porCampo;
  }, [tablero.campos, tablero.cards]);

  function agregar() {
    if (!valido) return;
    crear.mutate(
      { nombre: nombre.trim(), tipo, opciones: tipo === "lista" ? todas : undefined },
      {
        onSuccess: () => {
          setNombre("");
          setOpciones([]);
          setBorrador("");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      {activos.length ? (
        <ul className="divide-y divide-linea/70 rounded-xl border border-linea">
          {activos.map((c) => (
            <FilaCampo key={c.id} tableroId={tablero.id} campo={c} usos={usos.get(c.id)} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-linea px-4 py-5 text-center text-sm text-tenue">
          Sin campos propios. Agrega, por ejemplo, horas estimadas, código de documento o fase del proyecto.
        </p>
      )}

      {archivados.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerArchivados((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-tenue hover:bg-morado/8 hover:text-morado"
          >
            <Archive className="size-3.5" />
            {archivados.length} archivado{archivados.length === 1 ? "" : "s"}
          </button>
          {verArchivados && (
            <ul className="mt-2 divide-y divide-linea/70 rounded-xl border border-linea opacity-80">
              {archivados.map((c) => (
                <FilaCampo key={c.id} tableroId={tablero.id} campo={c} />
              ))}
            </ul>
          )}
        </div>
      )}

      <Seccion titulo="Nuevo campo">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Entrada
              value={nombre}
              maxLength={60}
              placeholder="Nombre del campo"
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregar()}
            />
            <div className="flex gap-1 rounded-xl border border-linea bg-white p-1" role="radiogroup" aria-label="Tipo de campo">
              {(Object.keys(TIPOS) as TipoCampo[]).map((t) => {
                const { etiqueta, icono: Icono } = TIPOS[t];
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t}
                    onClick={() => setTipo(t)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                      tipo === t ? "bg-morado text-white" : "text-tenue hover:bg-columna",
                    )}
                  >
                    <Icono className="size-3.5" />
                    {etiqueta}
                  </button>
                );
              })}
            </div>
          </div>
          {tipo === "lista" && (
            <EditorOpciones opciones={opciones} borrador={borrador} onBorrador={setBorrador} onCambio={setOpciones} />
          )}
          <p className="text-xs text-tenue">El tipo no se puede cambiar después; un campo se archiva sin perder sus valores.</p>
          <div className="flex justify-end">
            <Boton tamano="sm" disabled={!valido} cargando={crear.isPending} onClick={agregar}>
              <Plus />
              Agregar campo
            </Boton>
          </div>
        </div>
      </Seccion>
    </div>
  );
}

function FilaCampo({
  tableroId,
  campo,
  usos,
}: {
  tableroId: number;
  campo: CampoPersonalizado;
  /** Tarjetas que tienen cada opción (solo listas). */
  usos?: Map<string, number>;
}) {
  const editar = useEditarCampo(tableroId);
  const [nombre, setNombre] = useState(campo.nombre);
  // Con el editor abierto manda esta copia, no la caché: cada cambio envía la
  // lista entera, y un refresco del tablero a mitad de varios cambios seguidos
  // la dejaría vieja (el siguiente clic caería en otra opción). null = cerrado.
  const [locales, setLocales] = useState<string[] | null>(null);
  const [borrador, setBorrador] = useState("");
  const editando = locales !== null;
  const opciones = locales ?? campo.opciones;
  const { etiqueta, icono: Icono } = TIPOS[campo.tipo];

  function guardarNombre() {
    const limpio = nombre.trim();
    if (!limpio) setNombre(campo.nombre);
    else if (limpio !== campo.nombre) editar.mutate({ id: campo.id, cambios: { nombre: limpio } });
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Pildora icono={Icono}>{etiqueta}</Pildora>
        <input
          value={nombre}
          maxLength={60}
          disabled={campo.archivado}
          aria-label="Nombre del campo"
          onChange={(e) => setNombre(e.target.value)}
          onBlur={guardarNombre}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-texto outline-none hover:border-linea focus:border-morado/40 disabled:hover:border-transparent"
        />
        {!campo.archivado && (
          <button
            type="button"
            onClick={() => editar.mutate({ id: campo.id, cambios: { visible_en_tarjeta: !campo.visible_en_tarjeta } })}
            aria-pressed={campo.visible_en_tarjeta}
            title={campo.visible_en_tarjeta ? "Se ve en la tarjeta del tablero" : "Solo dentro de la tarjeta abierta"}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
              campo.visible_en_tarjeta ? "bg-morado/10 text-morado" : "text-tenue hover:bg-columna",
            )}
          >
            {campo.visible_en_tarjeta ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            En la tarjeta
          </button>
        )}
        <button
          type="button"
          onClick={() => editar.mutate({ id: campo.id, cambios: { archivado: !campo.archivado } })}
          aria-label={campo.archivado ? `Restaurar ${campo.nombre}` : `Archivar ${campo.nombre}`}
          title={campo.archivado ? "Restaurar" : "Archivar (conserva los valores)"}
          className="rounded-lg p-1.5 text-tenue transition-colors hover:bg-morado/8 hover:text-morado"
        >
          {campo.archivado ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </button>
      </div>
      {campo.tipo === "lista" && !campo.archivado && (
        <div className="mt-1.5 pl-1">
          <button
            type="button"
            aria-expanded={editando}
            onClick={() => setLocales((v) => (v ? null : campo.opciones))}
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs text-tenue transition-colors hover:bg-morado/8 hover:text-morado"
          >
            <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", !editando && "-rotate-90")} />
            <span className="shrink-0 font-semibold">
              {opciones.length === 1 ? "1 opción" : `${opciones.length} opciones`}
            </span>
            {!editando && <span className="truncate">{opciones.join(" · ")}</span>}
          </button>
          {editando && (
            <div className="mt-2">
              <EditorOpciones
                opciones={opciones}
                usos={usos}
                borrador={borrador}
                onBorrador={setBorrador}
                onCambio={(nuevas, renombrar) => {
                  setLocales(nuevas);
                  editar.mutate(
                    { id: campo.id, cambios: renombrar ? { opciones: nuevas, renombrar } : { opciones: nuevas } },
                    // Si el servidor lo rechaza, se cierra: al reabrir muestra lo que quedó guardado.
                    { onError: () => setLocales(null) },
                  );
                }}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
