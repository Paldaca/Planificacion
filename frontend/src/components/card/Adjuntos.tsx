import { ChevronLeft, ChevronRight, Download, File as IconoArchivo, FileSpreadsheet, FileText, Paperclip, Trash2, Upload, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { MAX_BYTES_ADJUNTO, urlImagen, useDescargarAdjunto, useQuitarAdjunto, useSubirAdjunto } from "@/api/adjuntos";
import type { Adjunto, CardDetalle } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { cn } from "@/lib/cn";
import { haceCuanto } from "@/lib/fechas";

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-VE", { maximumFractionDigits: 1 })} MB`;
}

const ICONOS = { hoja: FileSpreadsheet, documento: FileText, otro: IconoArchivo };

function claseDe(adjunto: Adjunto): keyof typeof ICONOS {
  if (/sheet|excel|csv/.test(adjunto.tipo)) return "hoja";
  if (/pdf|word|document|text/.test(adjunto.tipo)) return "documento";
  return "otro";
}

/** Una captura pegada llega como «image.png»: se le pone la fecha y la hora para distinguirla. */
function conNombreDeCaptura(archivo: File): File {
  if (!/^image\.\w+$/i.test(archivo.name)) return archivo;
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  const sello = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}.${dos(d.getMinutes())}.${dos(d.getSeconds())}`;
  const extension = archivo.name.split(".").pop();
  return new File([archivo], `Captura ${sello}.${extension}`, { type: archivo.type });
}

/**
 * Archivos adjuntos a la tarjeta, bajo la descripción. Las **imágenes** (PNG,
 * JPG, GIF, WebP) se ven aquí mismo como miniaturas y se abren a pantalla
 * completa; el resto (un Word, un PDF) se descarga con un clic. Se añaden con
 * el botón, soltándolos encima o, una captura, pegándola con Ctrl+V. Quien
 * solo consulta los ve y los descarga.
 */
export function Adjuntos({ card, tableroId, puede }: { card: CardDetalle; tableroId: number; puede: boolean }) {
  const subir = useSubirAdjunto(tableroId, card);
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  /** Id de la imagen abierta en el visor. */
  const [viendo, setViendo] = useState<number | null>(null);

  const imagenes = card.adjuntos.filter((a) => a.es_imagen);
  const archivos = card.adjuntos.filter((a) => !a.es_imagen);
  const indiceVisor = imagenes.findIndex((a) => a.id === viendo);

  function subirArchivos(lista: File[]) {
    for (const archivo of lista) {
      if (archivo.size > MAX_BYTES_ADJUNTO) {
        toast.error(`«${archivo.name}» pesa más de ${tamanoLegible(MAX_BYTES_ADJUNTO)}.`);
        continue;
      }
      subir.mutate(archivo);
    }
  }

  // Pegar una captura en cualquier parte de la tarjeta la adjunta. Si el
  // portapapeles también trae texto (copiar de Word o Excel pone el texto y una
  // imagen de ese texto), es un pegado de texto normal y no se toca.
  const alPegar = useEffectEvent((e: ClipboardEvent) => {
    const datos = e.clipboardData;
    if (!datos || datos.getData("text/plain")) return;
    const pegadas = Array.from(datos.files).filter((f) => f.type.startsWith("image/"));
    if (!pegadas.length) return;
    e.preventDefault();
    subirArchivos(pegadas.map(conNombreDeCaptura));
  });
  useEffect(() => {
    if (!puede) return;
    const oir = (e: ClipboardEvent) => alPegar(e);
    document.addEventListener("paste", oir);
    return () => document.removeEventListener("paste", oir);
  }, [puede]);

  if (!puede && card.adjuntos.length === 0) return null;

  function alSoltar(e: DragEvent) {
    e.preventDefault();
    setEncima(false);
    subirArchivos(Array.from(e.dataTransfer.files));
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
                subirArchivos(Array.from(e.target.files ?? []));
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

      {imagenes.length > 0 && (
        <ul className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {imagenes.map((a) => (
            <Miniatura key={a.id} adjunto={a} card={card} tableroId={tableroId} puede={puede} onVer={() => setViendo(a.id)} />
          ))}
        </ul>
      )}
      {archivos.length > 0 && (
        <ul className="divide-y divide-linea/70 rounded-2xl border border-linea">
          {archivos.map((a) => (
            <FilaAdjunto key={a.id} adjunto={a} card={card} tableroId={tableroId} puede={puede} />
          ))}
        </ul>
      )}
      {card.adjuntos.length === 0 && (
        <p className="rounded-2xl border border-dashed border-linea px-4 py-3 text-sm text-tenue/80">
          Sin archivos. Adjunta la captura o el documento que acompaña a esta tarjeta (hasta {tamanoLegible(MAX_BYTES_ADJUNTO)} cada
          uno): con el botón, soltándolo aquí o pegando una captura con Ctrl+V.
        </p>
      )}

      {indiceVisor >= 0 && (
        <Visor imagenes={imagenes} indice={indiceVisor} onIndice={(i) => setViendo(imagenes[i].id)} onCerrar={() => setViendo(null)} />
      )}
    </section>
  );
}

type PropsAdjunto = { adjunto: Adjunto; card: CardDetalle; tableroId: number; puede: boolean };

/** Papelera que pide confirmar: quitar un adjunto lo borra de verdad. */
function BotonQuitar({ adjunto, card, tableroId, className }: Omit<PropsAdjunto, "puede"> & { className?: string }) {
  const quitar = useQuitarAdjunto(tableroId, card);
  const [confirmar, setConfirmar] = useState(false);

  if (confirmar) {
    return (
      <Boton
        variante="peligro"
        tamano="sm"
        autoFocus
        cargando={quitar.isPending}
        onBlur={() => setConfirmar(false)}
        onClick={() => quitar.mutate(adjunto.id)}
        className={className}
      >
        ¿Quitar?
      </Boton>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Quitar ${adjunto.nombre}`}
      title="Quitar (se borra el archivo)"
      onClick={() => setConfirmar(true)}
      className={cn(
        "rounded-lg p-1.5 text-tenue transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626] pointer-coarse:p-2",
        className,
      )}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function Miniatura({ adjunto, card, tableroId, puede, onVer }: PropsAdjunto & { onVer: () => void }) {
  return (
    <li className="group relative overflow-hidden rounded-xl border border-linea bg-fondo">
      <button type="button" onClick={onVer} aria-label={`Ver ${adjunto.nombre}`} className="block w-full text-left">
        <img
          src={urlImagen(adjunto)}
          alt=""
          loading="lazy"
          className="aspect-[4/3] w-full bg-columna object-cover transition-transform duration-300 ease-suave group-hover:scale-[1.03]"
        />
        <span className="block truncate px-2.5 py-1.5 text-xs font-medium text-texto" title={adjunto.nombre}>
          {adjunto.nombre}
        </span>
      </button>
      {puede && (
        // Sin hover en táctil: ahí se ve siempre.
        <BotonQuitar
          adjunto={adjunto}
          card={card}
          tableroId={tableroId}
          className="absolute top-1.5 right-1.5 bg-white/90 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        />
      )}
    </li>
  );
}

function FilaAdjunto({ adjunto, card, tableroId, puede }: PropsAdjunto) {
  const descargar = useDescargarAdjunto();
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
      {puede && <BotonQuitar adjunto={adjunto} card={card} tableroId={tableroId} />}
    </li>
  );
}

const BOTON_VISOR =
  "grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-0";

/**
 * Capa del visor: por encima de la barra de la Suite (`#paldaca-nav-root`,
 * z-index ~1050), que al abrir el módulo suelto taparía su cabecera.
 */
const CAPA_VISOR = "fixed inset-0 z-[1100]";

/** La imagen a pantalla completa, sobre la tarjeta. Flechas para pasar a la anterior o la siguiente; Esc cierra. */
function Visor({
  imagenes,
  indice,
  onIndice,
  onCerrar,
}: {
  imagenes: Adjunto[];
  indice: number;
  onIndice: (i: number) => void;
  onCerrar: () => void;
}) {
  const descargar = useDescargarAdjunto();
  const imagen = imagenes[indice];
  const ir = (salto: number) => {
    const destino = indice + salto;
    if (destino >= 0 && destino < imagenes.length) onIndice(destino);
  };

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Overlay className={cn(CAPA_VISOR, "bg-marino/90 backdrop-blur-sm")} />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") ir(-1);
            if (e.key === "ArrowRight") ir(1);
          }}
          className={cn(CAPA_VISOR, "flex flex-col outline-none")}
        >
          <div className="flex items-center gap-3 px-4 py-3 text-white">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold">{imagen.nombre}</Dialog.Title>
              <p className="truncate text-xs text-white/70">
                {imagenes.length > 1 && `${indice + 1} de ${imagenes.length} · `}
                {tamanoLegible(imagen.tamano)}
                {imagen.subido_por && ` · ${imagen.subido_por.nombre}`} · {haceCuanto(imagen.creado_en)}
              </p>
            </div>
            <button type="button" onClick={() => descargar.mutate(imagen)} aria-label="Descargar" title="Descargar" className={BOTON_VISOR}>
              <Download className={cn("size-5", descargar.isPending && "animate-pulse")} />
            </button>
            <Dialog.Close aria-label="Cerrar" title="Cerrar (Esc)" className={BOTON_VISOR}>
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {/* Un clic fuera de la imagen (en el fondo) también cierra. */}
          <div
            className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 pb-4 sm:gap-4 sm:px-4"
            onClick={(e) => e.target === e.currentTarget && onCerrar()}
          >
            <button type="button" onClick={() => ir(-1)} disabled={indice === 0} aria-label="Imagen anterior" className={BOTON_VISOR}>
              <ChevronLeft className="size-6" />
            </button>
            <img
              key={imagen.id}
              src={urlImagen(imagen)}
              alt={imagen.nombre}
              className="max-h-full min-w-0 max-w-full flex-initial rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => ir(1)}
              disabled={indice === imagenes.length - 1}
              aria-label="Imagen siguiente"
              className={BOTON_VISOR}
            >
              <ChevronRight className="size-6" />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
