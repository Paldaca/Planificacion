/** Flechas de dependencias y el panel para editarlas. */

import { Minus, Plus, Trash2, Waypoints } from "lucide-react";
import { Popover } from "radix-ui";
import { useState, type PointerEvent as ReactPointerEvent } from "react";

import { useEditarDependencia, useEliminarDependencia } from "@/api/queries";
import type { CardResumen, Dependencia, TipoDependencia } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { cn } from "@/lib/cn";
import { ETIQUETAS_TIPO, rutaFlecha } from "@/lib/gantt";

import type { Enlace } from "./tipos";

export function Flechas({
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

export function PanelDependencia({
  tableroId,
  dep,
  x,
  y,
  predecesora,
  sucesora,
  puede,
  onCerrar,
}: {
  tableroId: number;
  dep: Dependencia;
  x: number;
  y: number;
  predecesora?: CardResumen;
  sucesora?: CardResumen;
  puede: boolean;
  onCerrar: () => void;
}) {
  const editar = useEditarDependencia(tableroId);
  const eliminar = useEliminarDependencia(tableroId);
  const [desfase, setDesfase] = useState(dep.desfase_dias);

  function guardarDesfase(valor: number) {
    const limpio = Math.max(-365, Math.min(365, Math.round(valor) || 0));
    setDesfase(limpio);
    if (limpio !== dep.desfase_dias) editar.mutate({ id: dep.id, cambios: { desfase_dias: limpio } });
  }

  return (
    <Popover.Root open onOpenChange={(v) => !v && onCerrar()}>
      <Popover.Anchor asChild>
        <span className="absolute size-px" style={{ left: x, top: y }} />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          // Aunque va en un portal, en React el evento sube hasta el área del
          // Gantt, que cierra la selección al tocarla: sin esto el panel se
          // cerraba antes del clic y sus botones no respondían.
          onPointerDown={(e) => e.stopPropagation()}
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
