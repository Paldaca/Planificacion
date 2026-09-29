import { FileDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useExportar } from "@/api/queries";
import type { TableroDetalle } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";
import { aISO, sumarDiasISO } from "@/lib/dias";
import { hoy } from "@/lib/fechas";
import { hayFiltros, type EstadoFiltros } from "@/lib/filtros";
import type { Agrupacion, Zoom } from "@/lib/gantt";

/** Lo que el PDF toma del Gantt de la pantalla. */
export type ConfigGantt = { zoom: Zoom; agrupar: Agrupacion; plegados: string[] };

const NOMBRE_ZOOM: Record<Zoom, string> = { dia: "Día", semana: "Semana", mes: "Mes" };
const NOMBRE_AGRUPAR: Record<Agrupacion, string> = {
  columna: "columna",
  responsable: "responsable",
  urgencia: "urgencia",
  ninguna: "sin agrupar",
};

type Escala = "ajustar" | "zoom";
type Hoja = "carta" | "tabloide";

/**
 * Gantt en PDF para compartir (lo genera el servidor: `exportar/?formato=pdf`).
 * Sale con los filtros, la agrupación y los grupos plegados de la pantalla;
 * aquí se elige la escala (la del Gantt o ajustada al ancho), el periodo y la
 * hoja (Carta u 11×17, horizontales).
 */
export function ExportarPdfDialogo({
  tablero,
  filtros,
  config,
  abierto,
  onCerrar,
}: {
  tablero: TableroDetalle;
  filtros: EstadoFiltros;
  config: ConfigGantt;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const exportar = useExportar(tablero.id);
  const [escala, setEscala] = useState<Escala>("ajustar");
  const [periodo, setPeriodo] = useState<"todo" | "rango">("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [hoja, setHoja] = useState<Hoja>("carta");

  useAlAbrir(abierto, () => {
    // Propuesta para «de una fecha a otra»: las próximas cuatro semanas.
    const inicio = aISO(hoy());
    setDesde(inicio);
    setHasta(sumarDiasISO(inicio, 27));
  });

  const rangoValido = periodo === "todo" || (desde !== "" && hasta !== "" && hasta >= desde);

  function descargar() {
    const extra: Record<string, string | string[]> = {
      escala,
      zoom: config.zoom,
      agrupar: config.agrupar,
      hoja,
      plegado: config.plegados,
    };
    if (periodo === "rango") Object.assign(extra, { desde, hasta });
    exportar.mutate(
      { formato: "pdf", filtros, extra },
      {
        onSuccess: () => {
          toast.success("PDF del Gantt descargado");
          onCerrar();
        },
      },
    );
  }

  const plegados = config.plegados.length;
  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Gantt en PDF"
      descripcion="Un PDF para compartir o imprimir con el diagrama, el resumen de avance y la leyenda."
      icono={FileDown}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} className="max-sm:hidden">
            Cancelar
          </Boton>
          <Boton disabled={!rangoValido} cargando={exportar.isPending} onClick={descargar}>
            <FileDown />
            Descargar PDF
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Opciones
          titulo="Escala de tiempo"
          valor={escala}
          onCambio={setEscala}
          opciones={[
            { id: "ajustar", texto: "Ajustar al ancho", detalle: "Todo el periodo en una hoja a lo ancho." },
            {
              id: "zoom",
              texto: `Como en el Gantt (${NOMBRE_ZOOM[config.zoom]})`,
              detalle: "Un plan largo sigue en más hojas, por tramos.",
            },
          ]}
        />

        <Opciones
          titulo="Periodo"
          valor={periodo}
          onCambio={setPeriodo}
          opciones={[
            { id: "todo", texto: "Todo el plan", detalle: "Desde la primera hasta la última tarea." },
            { id: "rango", texto: "De una fecha a otra", detalle: "Solo las tareas que tocan esas fechas." },
          ]}
        />
        {periodo === "rango" && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Desde">
              <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Campo>
            <Campo etiqueta="Hasta" ayuda={desde && hasta && hasta < desde ? "Debe ser igual o posterior a «Desde»." : undefined}>
              <Entrada type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
            </Campo>
          </div>
        )}

        <Opciones
          titulo="Hoja (horizontal)"
          valor={hoja}
          onCambio={setHoja}
          opciones={[
            { id: "carta", texto: "Carta", detalle: "8½×11: impresora de oficina." },
            { id: "tabloide", texto: "11×17 (tabloide)", detalle: "El plan grande, para imprimir o colgar." },
          ]}
        />

        <p className="rounded-xl bg-fondo px-3.5 py-3 text-xs leading-relaxed text-tenue">
          Se aplica lo que ves en el Gantt: agrupado por <b className="text-marino">{NOMBRE_AGRUPAR[config.agrupar]}</b>
          {plegados > 0 && (
            <>
              , con <b className="text-marino">{plegados === 1 ? "1 grupo plegado" : `${plegados} grupos plegados`}</b>
            </>
          )}
          {hayFiltros(filtros) ? " y con los filtros activos del tablero." : ", sin filtros."}
        </p>
      </div>
    </Dialogo>
  );
}

function Opciones<T extends string>({
  titulo,
  valor,
  onCambio,
  opciones,
}: {
  titulo: string;
  valor: T;
  onCambio: (v: T) => void;
  opciones: { id: T; texto: string; detalle: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[0.78rem] font-semibold tracking-wide text-tenue uppercase">{titulo}</span>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={titulo}>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            onClick={() => onCambio(o.id)}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-left transition-colors pointer-coarse:py-3",
              valor === o.id ? "border-morado bg-morado/[0.06] ring-1 ring-morado/30" : "border-linea hover:border-morado/40",
            )}
          >
            <span className={cn("block text-sm font-semibold", valor === o.id ? "text-morado" : "text-texto")}>{o.texto}</span>
            <span className="block text-xs text-tenue">{o.detalle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
