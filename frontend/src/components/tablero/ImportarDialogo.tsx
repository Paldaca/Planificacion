import { CircleAlert, CircleCheck, CircleX, FileSpreadsheet, FileUp, RotateCcw, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { mensajeError } from "@/api/client";
import { useDescargarPlantilla, useImportar, useVistaPreviaImportacion } from "@/api/queries";
import type { FilaVistaPrevia, VistaPrevia } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { Dialogo } from "@/components/ui/Dialogo";
import { Pildora } from "@/components/ui/Estados";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";
import { URGENCIAS } from "@/lib/estilos";
import { rangoCorto } from "@/lib/fechas";

const ACEPTADOS = ".xlsx,.xml";

/**
 * Importar tarjetas en dos pasos: elegir el archivo (Excel de la plantilla,
 * Excel exportado desde Planificación o XML de MS Project) → revisar la vista
 * previa (nada se guarda) → confirmar.
 */
export function ImportarDialogo({
  tableroId,
  abierto,
  onCerrar,
}: {
  tableroId: number;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [encima, setEncima] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const previa = useVistaPreviaImportacion(tableroId);
  const importar = useImportar(tableroId);
  const plantilla = useDescargarPlantilla(tableroId);

  useAlAbrir(abierto, () => {
    setArchivo(null);
    setVista(null);
    setSoloProblemas(false);
    previa.reset();
  });

  function elegir(nuevo: File | undefined) {
    if (!nuevo) return;
    setArchivo(nuevo);
    setVista(null);
    previa.mutate(nuevo, { onSuccess: setVista });
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setEncima(false);
    elegir(e.dataTransfer.files[0]);
  }

  function confirmar() {
    if (!archivo) return;
    importar.mutate(archivo, {
      onSuccess: (r) => {
        const partes = [
          r.dependencias ? `${r.dependencias} dependencia${r.dependencias === 1 ? "" : "s"}` : null,
          r.omitidas ? `${r.omitidas} fila${r.omitidas === 1 ? "" : "s"} con errores sin importar` : null,
        ].filter(Boolean);
        toast.success(`Se importaron ${r.creadas} tarjeta${r.creadas === 1 ? "" : "s"}`, {
          description: partes.join(" · ") || undefined,
        });
        if (r.avisos.length) toast.warning("Algunas dependencias no se crearon", { description: r.avisos.join(" ") });
        onCerrar();
      },
    });
  }

  const filas = vista ? vista.filas.filter((f) => !soloProblemas || f.errores.length || f.avisos.length) : [];

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Importar tarjetas"
      descripcion="Desde Excel o desde MS Project. Antes de crear nada verás cómo quedará cada tarjeta."
      icono={FileUp}
      ancho={vista ? "xl" : "md"}
      pie={
        vista ? (
          <>
            <Boton variante="secundario" onClick={() => entrada.current?.click()}>
              <RotateCcw />
              Otro archivo
            </Boton>
            <Boton onClick={confirmar} cargando={importar.isPending} disabled={!vista.validas}>
              <Upload />
              Importar {vista.validas} tarjeta{vista.validas === 1 ? "" : "s"}
            </Boton>
          </>
        ) : (
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
        )
      }
    >
      <input
        ref={entrada}
        type="file"
        accept={ACEPTADOS}
        className="sr-only"
        onChange={(e) => {
          elegir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <AnimatePresence mode="wait" initial={false}>
        {!vista ? (
          <motion.div key="elegir" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setEncima(true);
              }}
              onDragLeave={() => setEncima(false)}
              onDrop={soltar}
              disabled={previa.isPending}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                encima ? "border-morado bg-morado/8" : "border-linea hover:border-morado/50 hover:bg-fondo",
              )}
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-morado/10 text-morado">
                {previa.isPending ? <span className="size-5 animate-spin rounded-full border-2 border-morado border-t-transparent" /> : <FileUp className="size-6" />}
              </span>
              <span className="font-display font-semibold text-marino">
                {previa.isPending ? `Leyendo ${archivo?.name}…` : "Arrastra aquí el archivo o haz clic para elegirlo"}
              </span>
              <span className="text-xs text-tenue">Excel (.xlsx) o XML de MS Project (.xml), hasta 5 MB y 1000 tarjetas.</span>
            </button>
            {previa.isError && (
              <p className="flex items-start gap-2 rounded-xl bg-[#fef2f2] px-3 py-2.5 text-sm text-[#b91c1c]">
                <CircleX className="mt-0.5 size-4 shrink-0" />
                {mensajeError(previa.error)}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-fondo px-4 py-3 text-sm text-tenue">
              <span>
                ¿Empiezas de cero? Usa la plantilla: trae las columnas de este tablero y las urgencias como listas.
                También sirve un Excel exportado desde aquí o un proyecto guardado como XML en MS Project.
              </span>
              <Boton variante="suave" tamano="sm" cargando={plantilla.isPending} onClick={() => plantilla.mutate()}>
                <FileSpreadsheet />
                Descargar plantilla
              </Boton>
            </div>
          </motion.div>
        ) : (
          <motion.div key="revisar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-1 truncate font-medium text-texto">{archivo?.name}</span>
              <Pildora color="#059669" icono={CircleCheck}>
                {vista.validas} se importan
              </Pildora>
              {vista.con_errores > 0 && (
                <Pildora color="#dc2626" icono={CircleX}>
                  {vista.con_errores} con errores
                </Pildora>
              )}
              {vista.dependencias > 0 && <Pildora>{vista.dependencias} dependencias</Pildora>}
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-tenue">
                <input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} className="accent-morado" />
                Solo filas con avisos o errores
              </label>
            </div>
            <div className="max-h-[52vh] overflow-auto rounded-xl border border-linea">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-fondo text-left text-[0.68rem] tracking-[0.08em] text-tenue uppercase">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    <th className="w-12 px-2 py-2">Fila</th>
                    <th className="px-2 py-2">Tarjeta</th>
                    <th className="px-2 py-2">Columna</th>
                    <th className="px-2 py-2">Fechas</th>
                    <th className="px-2 py-2">Responsables</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <FilaPrevia key={f.fila} fila={f} />
                  ))}
                  {!filas.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-tenue">
                        Ninguna fila con avisos ni errores.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialogo>
  );
}

function FilaPrevia({ fila }: { fila: FilaVistaPrevia }) {
  const error = fila.errores.length > 0;
  const aviso = !error && fila.avisos.length > 0;
  const Icono = error ? CircleX : aviso ? CircleAlert : CircleCheck;
  const mensajes = [...fila.errores.map((t) => ({ t, error: true })), ...fila.avisos.map((t) => ({ t, error: false }))];
  return (
    <>
      <tr className={cn("border-t border-linea/60", error && "bg-[#fef2f2]/60")}>
        <td className="px-3 py-2">
          <Icono className={cn("size-4", error ? "text-[#dc2626]" : aviso ? "text-[#d97706]" : "text-[#059669]")} />
        </td>
        <td className="px-2 py-2 text-xs text-tenue tabular-nums">{fila.fila}</td>
        <td className="px-2 py-2">
          <span className="flex items-center gap-2">
            <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: URGENCIAS[fila.urgencia].color }} />
            <span className={cn("font-medium", error ? "text-tenue" : "text-texto")}>{fila.titulo || "(sin título)"}</span>
            {fila.depende.length > 0 && <span className="text-xs text-tenue">después de {fila.depende.join(", ")}</span>}
          </span>
        </td>
        <td className="px-2 py-2 text-xs text-tenue">{fila.columna}</td>
        <td className="px-2 py-2 text-xs whitespace-nowrap text-tenue">{rangoCorto(fila.inicio, fila.fin) || "—"}</td>
        <td className="px-2 py-2 text-xs text-tenue">{fila.responsables.join(", ") || "—"}</td>
      </tr>
      {mensajes.length > 0 && (
        <tr className={cn(error && "bg-[#fef2f2]/60")}>
          <td />
          <td colSpan={5} className="px-2 pb-2">
            <ul className="space-y-0.5 text-xs">
              {mensajes.map((m, i) => (
                <li key={i} className={m.error ? "text-[#b91c1c]" : "text-[#b45309]"}>
                  {m.t}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
