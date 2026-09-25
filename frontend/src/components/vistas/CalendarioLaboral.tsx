import { CalendarCog, ChevronLeft, ChevronRight, Lock, Plus, Repeat, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { useCrearFeriado, useEliminarFeriado, useFeriados } from "@/api/queries";
import type { Feriado } from "@/api/tipos";
import { useIdentidad } from "@/auth/useIdentidad";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { Esqueleto, Pildora } from "@/components/ui/Estados";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";
import { parsearDia } from "@/lib/fechas";

const TIPOS: Record<Feriado["tipo"], { etiqueta: string; color?: string }> = {
  fijo: { etiqueta: "Cada año", color: "#32407b" },
  puntual: { etiqueta: "Solo este año", color: "#0d9488" },
  movil: { etiqueta: "Móvil (Pascua)" },
};

/** Botón para el administrador del módulo; el calendario es de toda la empresa. */
export function BotonCalendarioLaboral() {
  const identidad = useIdentidad();
  const [abierto, setAbierto] = useState(false);
  if (!identidad.es_administrador) return null;
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)}>
        <CalendarCog />
        Calendario laboral
      </Boton>
      <CalendarioLaboralDialogo abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  );
}

function CalendarioLaboralDialogo({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const { data, isLoading } = useFeriados(`${anio}-01-01`, `${anio}-12-31`);
  const crear = useCrearFeriado();
  const eliminar = useEliminarFeriado();
  const [nuevo, setNuevo] = useState({ fecha: "", nombre: "", recurrente: false });

  useAlAbrir(abierto, () => setNuevo({ fecha: "", nombre: "", recurrente: false }));

  function agregar() {
    crear.mutate(nuevo, {
      onSuccess: () => {
        toast.success("Feriado agregado", { description: `${nuevo.nombre} · los vencimientos se recalculan` });
        setNuevo({ fecha: "", nombre: "", recurrente: false });
      },
    });
  }

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Calendario laboral"
      descripcion="Días no hábiles de toda la empresa. Cuentan para duraciones, vencimientos y la reprogramación del Gantt."
      icono={CalendarCog}
      ancho="lg"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Boton variante="secundario" tamano="icono" aria-label="Año anterior" onClick={() => setAnio((a) => a - 1)}>
            <ChevronLeft />
          </Boton>
          <span className="font-display text-lg font-semibold text-marino tabular-nums">{anio}</span>
          <Boton variante="secundario" tamano="icono" aria-label="Año siguiente" onClick={() => setAnio((a) => a + 1)}>
            <ChevronRight />
          </Boton>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <ul className="max-h-[42vh] divide-y divide-linea/70 overflow-y-auto rounded-xl border border-linea">
            <AnimatePresence initial={false}>
              {(data ?? []).map((f) => {
                const fecha = parsearDia(f.fecha);
                const tipo = TIPOS[f.tipo];
                return (
                  <motion.li
                    key={`${f.fecha}-${f.id ?? f.nombre}`}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <span className="w-24 shrink-0 text-sm font-semibold text-texto tabular-nums">
                      {fecha.toLocaleDateString("es-VE", { day: "numeric", month: "short" })}
                      <span className="ml-1 text-xs font-normal text-tenue">
                        {fecha.toLocaleDateString("es-VE", { weekday: "short" })}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-texto">{f.nombre}</span>
                    <Pildora color={tipo.color} icono={f.tipo === "fijo" ? Repeat : f.tipo === "movil" ? Lock : undefined}>
                      {tipo.etiqueta}
                    </Pildora>
                    {f.editable && f.id !== null ? (
                      <button
                        type="button"
                        aria-label={`Quitar ${f.nombre}`}
                        disabled={eliminar.isPending}
                        onClick={() =>
                          eliminar.mutate(f.id as number, {
                            onSuccess: () => toast("Feriado quitado", { description: f.nombre }),
                          })
                        }
                        className="rounded-lg p-1.5 text-tenue transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : (
                      <span className="w-7" />
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}

        <div className="rounded-xl bg-fondo p-4">
          <p className="mb-3 text-sm font-semibold text-marino">Agregar día no hábil</p>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Campo etiqueta="Fecha">
              <Entrada type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
            </Campo>
            <Campo etiqueta="Nombre">
              <Entrada
                value={nuevo.nombre}
                maxLength={100}
                placeholder="Ej.: Día del Ingeniero, puente decretado"
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              />
            </Campo>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-texto">
              <span
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  nuevo.recurrente ? "bg-morado" : "bg-linea",
                )}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={nuevo.recurrente}
                  onChange={(e) => setNuevo({ ...nuevo, recurrente: e.target.checked })}
                />
                <span
                  className={cn(
                    "absolute size-4 rounded-full bg-white shadow transition-transform duration-200",
                    nuevo.recurrente ? "translate-x-[18px]" : "translate-x-0.5",
                  )}
                />
              </span>
              Se repite cada año
            </label>
            <Boton tamano="sm" disabled={!nuevo.fecha || !nuevo.nombre.trim()} cargando={crear.isPending} onClick={agregar}>
              <Plus />
              Agregar
            </Boton>
          </div>
        </div>
      </div>
    </Dialogo>
  );
}
