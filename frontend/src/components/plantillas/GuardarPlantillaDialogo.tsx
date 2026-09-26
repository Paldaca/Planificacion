import { Globe, LayoutTemplate, Lock, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useGuardarPlantilla } from "@/api/plantillas";
import type { AlcancePlantilla, TableroDetalle } from "@/api/tipos";
import { useIdentidad } from "@/auth/useIdentidad";
import { Boton } from "@/components/ui/Boton";
import { AreaTexto, Campo, Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";

/**
 * Guardar el tablero como plantilla (fase 5). Viajan columnas, etiquetas,
 * campos y tarjetas con fechas relativas en días hábiles; no viajan personas,
 * comentarios ni historial. El alcance que se ofrece depende del rol (el
 * backend lo vuelve a comprobar).
 */
export function GuardarPlantillaDialogo({
  tablero,
  abierto,
  onCerrar,
}: {
  tablero: TableroDetalle;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const identidad = useIdentidad();
  const guardar = useGuardarPlantilla();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [alcance, setAlcance] = useState<AlcancePlantilla>("personal");

  useAlAbrir(abierto, () => {
    setNombre(tablero.nombre);
    setDescripcion(tablero.descripcion);
    setAlcance("personal");
  });

  const opciones: { id: AlcancePlantilla; titulo: string; texto: string; icono: typeof Lock }[] = [
    { id: "personal", titulo: "Solo para mí", texto: "La ves y usas solo tú.", icono: Lock },
  ];
  if (tablero.equipo && (tablero.mi_rol === "administrador" || identidad.es_administrador)) {
    opciones.push({
      id: "equipo",
      titulo: `Equipo ${tablero.equipo.nombre}`,
      texto: "La usan todos los miembros del equipo.",
      icono: UsersRound,
    });
  }
  if (identidad.es_administrador) {
    opciones.push({ id: "global", titulo: "Todo el módulo", texto: "Cualquiera en Planificación puede usarla.", icono: Globe });
  }
  const conFechas = tablero.cards.filter((c) => c.fecha_inicio || c.fecha_fin).length;

  function confirmar() {
    guardar.mutate(
      {
        tablero: tablero.id,
        nombre: nombre.trim(),
        descripcion,
        alcance,
        equipo: alcance === "equipo" ? tablero.equipo?.id : null,
      },
      {
        onSuccess: (p) => {
          toast.success("Plantilla guardada", { description: `${p.nombre}: úsala al crear un tablero nuevo.` });
          onCerrar();
        },
      },
    );
  }

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Guardar como plantilla"
      descripcion="Para empezar otros tableros con la misma estructura y el mismo plan de trabajo."
      icono={LayoutTemplate}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton disabled={!nombre.trim()} cargando={guardar.isPending} onClick={confirmar}>
            Guardar plantilla
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} maxLength={100} autoFocus onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Descripción" ayuda="Opcional: para qué tipo de proyecto sirve.">
          <AreaTexto value={descripcion} rows={2} maxLength={2000} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
        <div className="space-y-1.5">
          <span className="text-[0.78rem] font-semibold tracking-wide text-tenue uppercase">Quién la puede usar</span>
          <div className="grid gap-2" role="radiogroup">
            {opciones.map(({ id, titulo, texto, icono: Icono }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={alcance === id}
                onClick={() => setAlcance(id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  alcance === id ? "border-morado bg-morado/[0.06]" : "border-linea hover:border-morado/40",
                )}
              >
                <Icono className={cn("size-4 shrink-0", alcance === id ? "text-morado" : "text-tenue")} />
                <span>
                  <span className="block text-sm font-semibold text-texto">{titulo}</span>
                  <span className="block text-xs text-tenue">{texto}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <p className="rounded-xl bg-fondo px-3 py-2.5 text-xs text-tenue">
          Se guardan {tablero.columnas.length} columnas, {tablero.etiquetas.length} etiquetas,{" "}
          {tablero.campos.filter((c) => !c.archivado).length} campos y {tablero.cards.length} tarjetas ({conFechas} con
          fechas, que se guardan relativas en días hábiles), con su checklist y dependencias. No se guardan personas,
          comentarios ni historial.
        </p>
      </div>
    </Dialogo>
  );
}
