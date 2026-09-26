import { Globe, LayoutTemplate, Lock, Trash2, UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { useEditarPlantilla, useEliminarPlantilla, usePlantillas } from "@/api/plantillas";
import type { AlcancePlantilla, Plantilla } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { Dialogo } from "@/components/ui/Dialogo";
import { Esqueleto, Pildora } from "@/components/ui/Estados";

const ALCANCES: Record<AlcancePlantilla, { texto: string; icono: typeof Lock; color: string }> = {
  personal: { texto: "Solo tú", icono: Lock, color: "#64748b" },
  equipo: { texto: "Equipo", icono: UsersRound, color: "#6d28d9" },
  global: { texto: "Todo el módulo", icono: Globe, color: "#0f766e" },
};

/**
 * Plantillas visibles para el usuario (fase 5): las suyas, las de sus equipos
 * y las globales. Desde aquí se usan (abre el diálogo de tablero nuevo con la
 * plantilla elegida) y, si se pueden gestionar, se renombran o eliminan.
 */
export function PlantillasDialogo({
  abierto,
  onCerrar,
  onUsar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onUsar: (plantilla: Plantilla) => void;
}) {
  const { data: plantillas, isLoading } = usePlantillas(abierto);

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Plantillas"
      descripcion="Empieza un tablero con la estructura y el plan de trabajo de otro."
      icono={LayoutTemplate}
      ancho="lg"
    >
      {isLoading ? (
        <div className="space-y-2">
          <Esqueleto className="h-16" />
          <Esqueleto className="h-16" />
        </div>
      ) : plantillas?.length ? (
        <ul className="divide-y divide-linea/70 rounded-xl border border-linea">
          <AnimatePresence initial={false}>
            {plantillas.map((p) => (
              <FilaPlantilla key={p.id} plantilla={p} onUsar={() => onUsar(p)} />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="rounded-xl bg-fondo px-4 py-5 text-sm text-tenue">
          Todavía no hay plantillas. Abre un tablero y usa «Guardar como plantilla…» en su menú: sus columnas,
          etiquetas, campos y tarjetas quedarán listos para repetir.
        </p>
      )}
    </Dialogo>
  );
}

function FilaPlantilla({ plantilla, onUsar }: { plantilla: Plantilla; onUsar: () => void }) {
  const editar = useEditarPlantilla();
  const eliminar = useEliminarPlantilla();
  const [nombre, setNombre] = useState(plantilla.nombre);
  const [confirmar, setConfirmar] = useState(false);
  const alcance = ALCANCES[plantilla.alcance];
  const { resumen } = plantilla;

  function guardarNombre() {
    const limpio = nombre.trim();
    if (!limpio) setNombre(plantilla.nombre);
    else if (limpio !== plantilla.nombre) editar.mutate({ id: plantilla.id, cambios: { nombre: limpio } });
  }

  const partes = [
    `${resumen.columnas} columnas`,
    resumen.tarjetas === 1 ? "1 tarjeta" : `${resumen.tarjetas} tarjetas`,
    resumen.etiquetas ? `${resumen.etiquetas} etiquetas` : null,
    resumen.campos ? `${resumen.campos} campos` : null,
    resumen.duracion ? `${resumen.duracion} días hábiles` : null,
  ].filter(Boolean);

  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          {plantilla.permisos.gestionar ? (
            <input
              value={nombre}
              maxLength={100}
              aria-label="Nombre de la plantilla"
              onChange={(e) => setNombre(e.target.value)}
              onBlur={guardarNombre}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="-ml-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-sm font-semibold text-texto outline-none hover:border-linea focus:border-morado/40"
            />
          ) : (
            <p className="truncate text-sm font-semibold text-texto">{plantilla.nombre}</p>
          )}
          <p className="mt-0.5 text-xs text-tenue">{partes.join(" · ")}</p>
          {plantilla.descripcion && <p className="mt-1 line-clamp-2 text-xs text-texto/80">{plantilla.descripcion}</p>}
        </div>
        <Pildora color={plantilla.equipo?.color ?? alcance.color} icono={alcance.icono}>
          {plantilla.alcance === "equipo" && plantilla.equipo ? plantilla.equipo.nombre : alcance.texto}
        </Pildora>
        <div className="flex items-center gap-1">
          {plantilla.permisos.gestionar &&
            (confirmar ? (
              <Boton
                variante="peligro"
                tamano="sm"
                cargando={eliminar.isPending}
                onClick={() =>
                  eliminar.mutate(plantilla.id, {
                    onSuccess: () => toast("Plantilla eliminada", { description: plantilla.nombre }),
                  })
                }
              >
                ¿Eliminar?
              </Boton>
            ) : (
              <button
                type="button"
                aria-label={`Eliminar ${plantilla.nombre}`}
                onClick={() => setConfirmar(true)}
                onBlur={() => window.setTimeout(() => setConfirmar(false), 200)}
                className="rounded-lg p-1.5 text-tenue transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626]"
              >
                <Trash2 className="size-4" />
              </button>
            ))}
          <Boton variante="suave" tamano="sm" onClick={onUsar}>
            Usar
          </Boton>
        </div>
      </div>
    </motion.li>
  );
}
