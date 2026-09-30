import { Download, File, FileImage, FileSpreadsheet, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { MAX_BYTES_ADJUNTO, useDescargarAdjunto, useQuitarAdjunto, useSubirAdjunto } from "@/api/adjuntos";
import type { Adjunto, CardDetalle } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { cn } from "@/lib/cn";
import { haceCuanto } from "@/lib/fechas";

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-VE", { maximumFractionDigits: 1 })} MB`;
}

const ICONOS = { imagen: FileImage, hoja: FileSpreadsheet, documento: FileText, otro: File };

function claseDe(adjunto: Adjunto): keyof typeof ICONOS {
  if (adjunto.tipo.startsWith("image/")) return "imagen";
  if (/sheet|excel|csv/.test(adjunto.tipo)) return "hoja";
  if (/pdf|word|document|text/.test(adjunto.tipo)) return "documento";
  return "otro";
}

/**
 * Archivos adjuntos a la tarjeta, bajo la descripción: se eligen con el botón
 * o se sueltan encima. Se descargan con un clic (el servidor nunca los abre en
 * línea). Quien solo consulta los ve y los descarga.
 */
export function Adjuntos({ card, tableroId, puede }: { card: CardDetalle; tableroId: number; puede: boolean }) {
  const subir = useSubirAdjunto(tableroId, card);
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  if (!puede && card.adjuntos.length === 0) return null;

  function subirArchivos(archivos: FileList | null) {
    for (const archivo of Array.from(archivos ?? [])) {
      if (archivo.size > MAX_BYTES_ADJUNTO) {
        toast.error(`«${archivo.name}» pesa más de ${tamanoLegible(MAX_BYTES_ADJUNTO)}.`);
        continue;
      }
      subir.mutate(archivo);
    }
  }

  function alSoltar(e: DragEvent) {
    e.preventDefault();
    setEncima(false);
    subirArchivos(e.dataTransfer.files);
  }

  return (
    <section
      onDragOver={puede ? (e) => (e.preventDefault(), setEncima(true)) : undefined}
      onDragLeave={puede ? () => setEncima(false) : undefined}
      onDrop={puede ? alSoltar : undefined}
      className={cn("rounded-2xl transition-shadow", encima && "shadow-[0_0_0_2px_rgba(50,64,123,0.35)]")}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-[0.95rem] font-semibold text-marino">
          <Paperclip className="size-4 text-morado" />
          Adjuntos
          {card.adjuntos.length > 0 && <span className="text-xs font-medium text-tenue tabular-nums">{card.adjuntos.length}</span>}
        </h3>
        {puede && (
          <>
            <input
              ref={entrada}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                subirArchivos(e.target.files);
                e.target.value = "";
              }}
            />
            <Boton tamano="sm" variante="suave" cargando={subir.isPending} onClick={() => entrada.current?.click()}>
              <Upload />
              Adjuntar
            </Boton>
          </>
        )}
      </div>
      {card.adjuntos.length > 0 ? (
        <ul className="divide-y divide-linea/70 rounded-2xl border border-linea">
          {card.adjuntos.map((a) => (
            <FilaAdjunto key={a.id} adjunto={a} card={card} tableroId={tableroId} puede={puede} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-linea px-4 py-3 text-sm text-tenue/80">
          Sin archivos. Adjunta el documento, el plano o la captura que acompaña a esta tarjeta (hasta{" "}
          {tamanoLegible(MAX_BYTES_ADJUNTO)} cada uno), o suéltalo aquí.
        </p>
      )}
    </section>
  );
}

function FilaAdjunto({ adjunto, card, tableroId, puede }: { adjunto: Adjunto; card: CardDetalle; tableroId: number; puede: boolean }) {
  const descargar = useDescargarAdjunto();
  const quitar = useQuitarAdjunto(tableroId, card);
  const [confirmar, setConfirmar] = useState(false);
  const Icono = ICONOS[claseDe(adjunto)];

  return (
    <li className="flex items-center gap-2 py-1.5 pr-2 pl-3">
      <button
        type="button"
        onClick={() => descargar.mutate(adjunto)}
        title="Descargar"
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left"
      >
        <Icono className="size-5 shrink-0 text-morado" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-texto group-hover:text-morado group-hover:underline">{adjunto.nombre}</span>
          <span className="block truncate text-xs text-tenue">
            {tamanoLegible(adjunto.tamano)}
            {adjunto.subido_por && ` · ${adjunto.subido_por.nombre}`} · {haceCuanto(adjunto.creado_en)}
          </span>
        </span>
        <Download className={cn("size-4 shrink-0 text-tenue", descargar.isPending && "animate-pulse text-morado")} />
      </button>
      {puede &&
        (confirmar ? (
          <Boton
            variante="peligro"
            tamano="sm"
            autoFocus
            cargando={quitar.isPending}
            onBlur={() => setConfirmar(false)}
            onClick={() => quitar.mutate(adjunto.id)}
          >
            ¿Quitar?
          </Boton>
        ) : (
          <button
            type="button"
            aria-label={`Quitar ${adjunto.nombre}`}
            title="Quitar (se borra el archivo)"
            onClick={() => setConfirmar(true)}
            className="rounded-lg p-1.5 text-tenue transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626] pointer-coarse:p-2"
          >
            <Trash2 className="size-4" />
          </button>
        ))}
    </li>
  );
}
