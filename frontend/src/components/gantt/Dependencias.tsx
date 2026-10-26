/** Flechas de dependencias y el panel para editarlas. */

import { Popover } from "radix-ui";
import { type PointerEvent as ReactPointerEvent } from "react";

import type { CardResumen, Dependencia } from "@/api/tipos";
import { EditorDependencia } from "@/components/card/Dependencias";
import { rutaFlecha } from "@/lib/gantt";

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
          className="flotante z-50 w-80 rounded-2xl border border-linea bg-white p-4 shadow-[0_24px_48px_-20px_rgba(20,22,68,0.5)]"
        >
          <EditorDependencia
            tableroId={tableroId}
            dep={dep}
            predecesora={predecesora}
            sucesora={sucesora}
            puede={puede}
            onQuitada={onCerrar}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
