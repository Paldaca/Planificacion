import { Archive, ArchiveRestore, Check, Eye, EyeOff, Hash, List, Plus, Settings2, Tag, Trash2, Type } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  useCrearCampo,
  useCrearEtiqueta,
  useEditarCampo,
  useEditarEtiqueta,
  useEliminarEtiqueta,
} from "@/api/configuracion";
import type { CampoPersonalizado, Etiqueta, TableroDetalle, TipoCampo } from "@/api/tipos";
import { SelectorColor } from "@/components/equipos/Dialogos";
import { Boton } from "@/components/ui/Boton";
import { Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { Pildora } from "@/components/ui/Estados";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";
import { COLORES_EQUIPO } from "@/lib/estilos";

const TIPOS: Record<TipoCampo, { etiqueta: string; icono: typeof Type }> = {
  texto: { etiqueta: "Texto", icono: Type },
  numero: { etiqueta: "Número", icono: Hash },
  lista: { etiqueta: "Lista", icono: List },
};

const opcionesDeTexto = (texto: string) => texto.split(",").map((o) => o.trim()).filter(Boolean);

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
      <div className="mb-4 flex gap-1 rounded-xl bg-fondo p-1" role="tablist">
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
  const [opciones, setOpciones] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const activos = tablero.campos.filter((c) => !c.archivado);
  const archivados = tablero.campos.filter((c) => c.archivado);
  const valido = nombre.trim() && (tipo !== "lista" || opcionesDeTexto(opciones).length > 0);

  function agregar() {
    if (!valido) return;
    crear.mutate(
      { nombre: nombre.trim(), tipo, opciones: tipo === "lista" ? opcionesDeTexto(opciones) : undefined },
      {
        onSuccess: () => {
          setNombre("");
          setOpciones("");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      {activos.length ? (
        <ul className="divide-y divide-linea/70 rounded-xl border border-linea">
          {activos.map((c) => (
            <FilaCampo key={c.id} tableroId={tablero.id} campo={c} />
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
            <Entrada
              value={opciones}
              placeholder="Opciones separadas por comas: Básica, Detalle, Construcción"
              onChange={(e) => setOpciones(e.target.value)}
            />
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

function FilaCampo({ tableroId, campo }: { tableroId: number; campo: CampoPersonalizado }) {
  const editar = useEditarCampo(tableroId);
  const [nombre, setNombre] = useState(campo.nombre);
  const [opciones, setOpciones] = useState(campo.opciones.join(", "));
  const { etiqueta, icono: Icono } = TIPOS[campo.tipo];

  function guardarNombre() {
    const limpio = nombre.trim();
    if (!limpio) setNombre(campo.nombre);
    else if (limpio !== campo.nombre) editar.mutate({ id: campo.id, cambios: { nombre: limpio } });
  }

  function guardarOpciones() {
    const nuevas = opcionesDeTexto(opciones);
    if (!nuevas.length) setOpciones(campo.opciones.join(", "));
    else if (nuevas.join("|") !== campo.opciones.join("|")) editar.mutate({ id: campo.id, cambios: { opciones: nuevas } });
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
        <div className="mt-2 flex items-center gap-2 pl-1">
          <span className="text-xs text-tenue">Opciones</span>
          <input
            value={opciones}
            aria-label="Opciones de la lista"
            onChange={(e) => setOpciones(e.target.value)}
            onBlur={guardarOpciones}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-2 py-1 text-xs text-texto outline-none focus:border-morado/40"
          />
          {editar.isSuccess && <Check className="size-3.5 text-[#059669]" />}
        </div>
      )}
    </li>
  );
}
