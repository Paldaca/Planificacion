import { Minus, Plus, Repeat } from "lucide-react";
import { motion } from "motion/react";
import { Popover } from "radix-ui";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  useEditarRecurrencia,
  useQuitarRecurrencia,
  useRecurrencias,
  useRepetirCard,
  type DatosRecurrencia,
} from "@/api/recurrencias";
import type { CardDetalle, Frecuencia, TableroDetalle } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto } from "@/components/ui/Estados";
import { cn } from "@/lib/cn";
import { diaCorto, parsearDia } from "@/lib/fechas";

const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const INICIALES = ["L", "M", "X", "J", "V", "S", "D"];

/** Quien gestiona el tablero arma y cambia las series. */
const gestiona = (tablero: TableroDetalle) => tablero.permisos.gestionar && !tablero.archivado;

/**
 * Botón discreto entre las acciones de la tarjeta (junto a «Mover a otro
 * tablero»): repetir es raro, así que no ocupa una sección hasta que la
 * tarjeta ya es parte de una serie (entonces se ve `SerieTarjeta`).
 */
export function BotonRepetir({ card, tablero }: { card: CardDetalle; tablero: TableroDetalle }) {
  const repetir = useRepetirCard(tablero.id);
  const [abierto, setAbierto] = useState(false);
  if (card.recurrencia !== null || card.archivada || !gestiona(tablero)) return null;
  // Como el servidor: la columna de la tarjeta, o la primera no final si está en la final.
  const columna = tablero.columnas.find((c) => c.id === card.columna);
  const destino = columna && !columna.es_final ? columna : tablero.columnas.find((c) => !c.es_final);

  return (
    <PanelRepeticion
      destino={destino?.nombre}
      abierto={abierto}
      onAbierto={setAbierto}
      inicial={porDefecto(card)}
      guardando={repetir.isPending}
      lado="top"
      onGuardar={(datos) =>
        repetir.mutate(
          { cardId: card.id, datos },
          {
            onSuccess: (r) => {
              setAbierto(false);
              toast.success(`Se repite: ${r.descripcion.toLowerCase()}`);
            },
          },
        )
      }
    >
      <Boton variante="secundario" tamano="sm" className="w-full">
        <Repeat />
        Repetir…
      </Boton>
    </PanelRepeticion>
  );
}

/** La serie de una tarjeta recurrente: cuándo vence la próxima y qué se puede hacer. */
export function SerieTarjeta({ card, tablero }: { card: CardDetalle; tablero: TableroDetalle }) {
  const series = useRecurrencias(tablero.id, card.recurrencia !== null);
  const regla = series.data?.find((r) => r.id === card.recurrencia) ?? null;
  const editar = useEditarRecurrencia(tablero.id);
  const quitar = useQuitarRecurrencia(tablero.id);
  const [abierto, setAbierto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  if (!regla) return series.isLoading ? <Esqueleto className="h-14" /> : null;

  return (
    <div className="space-y-2.5 rounded-xl bg-fondo p-3 text-sm">
      <div>
        <p className="font-semibold text-marino">
          {regla.descripcion}
          {!regla.activa && <span className="font-normal text-[#b45309]"> · en pausa</span>}
        </p>
        <p className="mt-0.5 text-xs text-tenue">
          {regla.activa
            ? `Próxima: vence el ${diaCorto(regla.vence)}, aparece el ${diaCorto(regla.se_crea)}.`
            : "No se crean tarjetas nuevas."}{" "}
          {regla.tarjetas === 1 ? "1 tarjeta en la serie." : `${regla.tarjetas} en la serie.`}
        </p>
      </div>
      {gestiona(tablero) && (
        <div className="flex flex-wrap gap-1.5">
          <PanelRepeticion
            abierto={abierto}
            onAbierto={setAbierto}
            inicial={regla}
            guardando={editar.isPending}
            lado="bottom"
            onGuardar={(datos) => editar.mutate({ id: regla.id, cambios: datos }, { onSuccess: () => setAbierto(false) })}
          >
            <Boton tamano="sm" variante="secundario">
              Cambiar
            </Boton>
          </PanelRepeticion>
          <Boton
            tamano="sm"
            variante="secundario"
            title="Las próximas copiarán esta tarjeta tal como está ahora"
            onClick={() =>
              editar.mutate(
                { id: regla.id, cambios: { modelo_desde: card.id } },
                { onSuccess: () => toast.success("Las próximas copiarán esta tarjeta") },
              )
            }
          >
            Usar como modelo
          </Boton>
          <Boton tamano="sm" variante="secundario" onClick={() => editar.mutate({ id: regla.id, cambios: { activa: !regla.activa } })}>
            {regla.activa ? "Pausar" : "Reanudar"}
          </Boton>
          <Boton
            tamano="sm"
            variante="peligro"
            cargando={quitar.isPending}
            onClick={() => (confirmar ? quitar.mutate(regla.id) : setConfirmar(true))}
            onBlur={() => setConfirmar(false)}
          >
            {confirmar ? "¿Seguro?" : "Dejar de repetir"}
          </Boton>
        </div>
      )}
    </div>
  );
}

function porDefecto(card: CardDetalle): DatosRecurrencia {
  const base = card.fecha_fin ? parsearDia(card.fecha_fin) : new Date();
  return { frecuencia: "mensual", intervalo: 1, dia: base.getDate(), anticipacion: 5 };
}

/** «Cada mes, el día 30 · aparece 5 días hábiles antes». */
function resumen({ frecuencia, intervalo, dia, anticipacion }: DatosRecurrencia): string {
  const unidad = frecuencia === "semanal" ? (intervalo === 1 ? "semana" : "semanas") : intervalo === 1 ? "mes" : "meses";
  const cada = intervalo === 1 ? `Cada ${unidad}` : `Cada ${intervalo} ${unidad}`;
  const cuando =
    frecuencia === "semanal" ? `el ${DIAS_SEMANA[dia]}` : dia >= 31 ? "el último día" : `el día ${dia}`;
  const aparece = anticipacion === 0 ? "aparece el mismo día" : `aparece ${anticipacion} día${anticipacion === 1 ? "" : "s"} hábil${anticipacion === 1 ? "" : "es"} antes`;
  return `${cada}, ${cuando} · ${aparece}`;
}

function PanelRepeticion({
  destino,
  abierto,
  onAbierto,
  inicial,
  guardando,
  lado,
  onGuardar,
  children,
}: {
  /** Columna donde quedarán las tarjetas nuevas (solo al armar la serie). */
  destino?: string;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  inicial: DatosRecurrencia;
  guardando: boolean;
  lado: "top" | "bottom";
  onGuardar: (datos: DatosRecurrencia) => void;
  children: ReactNode;
}) {
  return (
    <Popover.Root open={abierto} onOpenChange={onAbierto}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side={lado}
          sideOffset={6}
          collisionPadding={12}
          className="flotante z-[60] w-[19rem] rounded-xl border border-linea bg-white p-3 shadow-[0_18px_38px_-18px_rgba(20,22,68,0.4)]"
        >
          {/* Se monta al abrir: cada vez empieza desde `inicial`. */}
          <Formulario
            destino={destino}
            inicial={inicial}
            guardando={guardando}
            onGuardar={onGuardar}
            onCancelar={() => onAbierto(false)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Formulario({
  destino,
  inicial,
  guardando,
  onGuardar,
  onCancelar,
}: {
  destino?: string;
  inicial: DatosRecurrencia;
  guardando: boolean;
  onGuardar: (datos: DatosRecurrencia) => void;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosRecurrencia>({
    frecuencia: inicial.frecuencia,
    intervalo: inicial.intervalo,
    dia: inicial.dia,
    anticipacion: inicial.anticipacion,
  });
  const cambiar = (cambio: Partial<DatosRecurrencia>) => setDatos((d) => ({ ...d, ...cambio }));

  function cambiarFrecuencia(frecuencia: Frecuencia) {
    if (frecuencia === datos.frecuencia) return;
    cambiar({ frecuencia, dia: frecuencia === "semanal" ? 0 : 1 });
  }

  const mensual = datos.frecuencia === "mensual";
  return (
    <div className="space-y-3.5 text-sm">
      <div>
        <p className="flex items-center gap-1.5 font-semibold text-marino">
          <Repeat className="size-4" />
          Repetir esta tarjeta
        </p>
        <p className="mt-0.5 text-xs text-tenue">{resumen(datos)}</p>
      </div>

      <Segmentado
        opciones={[
          ["semanal", "Semanal"],
          ["mensual", "Mensual"],
        ]}
        valor={datos.frecuencia}
        onCambio={cambiarFrecuencia}
      />

      <Fila etiqueta={mensual ? "Cada cuántos meses" : "Cada cuántas semanas"}>
        <Contador valor={datos.intervalo} min={1} max={12} onCambio={(intervalo) => cambiar({ intervalo })} />
      </Fila>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-tenue">{mensual ? "Vence el día" : "Vence el"}</p>
        {mensual ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
              <Dia key={d} activo={datos.dia === d} onClick={() => cambiar({ dia: d })}>
                {d}
              </Dia>
            ))}
            <Dia activo={datos.dia === 31} onClick={() => cambiar({ dia: 31 })} className="col-span-5" titulo="31 o el último del mes">
              Último del mes
            </Dia>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {INICIALES.map((inicial, i) => (
              <Dia key={i} activo={datos.dia === i} onClick={() => cambiar({ dia: i })} titulo={DIAS_SEMANA[i]}>
                {inicial}
              </Dia>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[0.7rem] text-tenue">Si no es día hábil, vence el hábil anterior.</p>
      </div>

      <Fila etiqueta="Aparece antes (días hábiles)">
        <Contador valor={datos.anticipacion} min={0} max={30} onCambio={(anticipacion) => cambiar({ anticipacion })} />
      </Fila>

      <p className="rounded-lg bg-fondo px-2.5 py-2 text-[0.7rem] leading-snug text-tenue">
        Cada tarjeta nueva se crea en este tablero{destino ? <>, en la columna <b className="text-texto">{destino}</b></> : ""}, y
        copia esta (título, descripción, responsables, etiquetas, campos y checklist) con el periodo en el título.
      </p>

      <div className="flex justify-end gap-2">
        <Boton tamano="sm" variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton tamano="sm" cargando={guardando} onClick={() => onGuardar(datos)}>
          Guardar
        </Boton>
      </div>
    </div>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-tenue">{etiqueta}</span>
      {children}
    </div>
  );
}

/** Mismo control que «Gantt» en la tarjeta: opciones en una píldora con la elegida en blanco. */
function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: [T, string][];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-fondo p-1" role="radiogroup">
      {opciones.map(([id, texto]) => {
        const activa = valor === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onCambio(id)}
            className={cn(
              "relative rounded-lg px-2 py-1.5 text-[0.78rem] font-semibold transition-colors",
              activa ? "text-morado" : "text-tenue hover:text-morado",
            )}
          >
            {activa && (
              <motion.span
                layoutId="frecuencia-repetir"
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{texto}</span>
          </button>
        );
      })}
    </div>
  );
}

function Contador({ valor, min, max, onCambio }: { valor: number; min: number; max: number; onCambio: (v: number) => void }) {
  const boton =
    "grid size-7 place-items-center rounded-md text-tenue transition-colors hover:bg-white hover:text-morado disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-fondo p-0.5">
      <button type="button" className={boton} disabled={valor <= min} onClick={() => onCambio(valor - 1)} aria-label="Menos">
        <Minus className="size-3.5" />
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums text-marino">{valor}</span>
      <button type="button" className={boton} disabled={valor >= max} onClick={() => onCambio(valor + 1)} aria-label="Más">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function Dia({
  activo,
  onClick,
  className,
  titulo,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  className?: string;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "h-7 rounded-md text-[0.75rem] font-semibold tabular-nums transition-colors",
        activo ? "bg-morado text-white shadow-sm" : "bg-fondo text-texto hover:bg-morado/10 hover:text-morado",
        className,
      )}
    >
      {children}
    </button>
  );
}
