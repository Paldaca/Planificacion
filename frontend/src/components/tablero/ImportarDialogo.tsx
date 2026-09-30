import { CircleAlert, CircleCheck, CircleX, FileSpreadsheet, FileUp, RotateCcw, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { mensajeError } from "@/api/client";
import { useDescargarPlantilla, useImportar, useVistaPreviaImportacion } from "@/api/queries";
import type { CrearFaltantes, FilaVistaPrevia, VistaPrevia } from "@/api/tipos";
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
 *
 * Las columnas y etiquetas que el archivo nombra y el tablero no tiene salen
 * resumidas arriba de la vista previa; quien gestiona el tablero puede
 * crearlas al importar (casillas marcadas por defecto). Cambiar una casilla
 * vuelve a pedir la vista previa: la decide el servidor.
 */
export function ImportarDialogo({
  tableroId,
  puedeCrear,
  abierto,
  onCerrar,
}: {
  tableroId: number;
  /** Gestiona el tablero: puede crear columnas y etiquetas (el servidor lo vuelve a comprobar). */
  puedeCrear: boolean;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [crear, setCrear] = useState<CrearFaltantes>({ columnas: puedeCrear, etiquetas: puedeCrear });
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
    setCrear({ columnas: puedeCrear, etiquetas: puedeCrear });
    previa.reset();
  });

  function elegir(nuevo: File | undefined) {
    if (!nuevo) return;
    setArchivo(nuevo);
    setVista(null);
    previa.mutate({ archivo: nuevo, crear }, { onSuccess: setVista });
  }

  /** Cambiar una casilla: la vista previa se vuelve a calcular con la decisión nueva. */
  function cambiarCrear(cambio: Partial<CrearFaltantes>) {
    const nuevo = { ...crear, ...cambio };
    setCrear(nuevo);
    if (archivo) previa.mutate({ archivo, crear: nuevo }, { onSuccess: setVista });
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setEncima(false);
    elegir(e.dataTransfer.files[0]);
  }

  function confirmar() {
    if (!archivo) return;
    importar.mutate({ archivo, crear }, {
      onSuccess: (r) => {
        const partes = [
          r.columnas_creadas.length ? `${r.columnas_creadas.length} columna${r.columnas_creadas.length === 1 ? "" : "s"} nueva${r.columnas_creadas.length === 1 ? "" : "s"}` : null,
          r.etiquetas_creadas.length ? `${r.etiquetas_creadas.length} etiqueta${r.etiquetas_creadas.length === 1 ? "" : "s"} nueva${r.etiquetas_creadas.length === 1 ? "" : "s"}` : null,
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
            <Boton onClick={confirmar} cargando={importar.isPending} disabled={!vista.validas || vista.problemas.length > 0 || previa.isPending}>
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
            <Faltantes vista={vista} crear={crear} onCambio={cambiarCrear} recalculando={previa.isPending} />
            {vista.problemas.map((p) => (
              <p key={p} className="flex items-start gap-2 rounded-xl bg-[#fef2f2] px-3 py-2.5 text-sm text-[#b91c1c]">
                <CircleX className="mt-0.5 size-4 shrink-0" />
                {p}
              </p>
            ))}
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
            {fila.etiquetas.map((e) => {
              const nueva = fila.etiquetas_nuevas.includes(e);
              return (
                <span
                  key={e}
                  title={nueva ? "Se creará al importar" : undefined}
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-px text-[0.66rem] font-semibold text-morado",
                    nueva ? "border border-dashed border-morado/50" : "bg-morado/10",
                  )}
                >
                  {e}
                </span>
              );
            })}
          </span>
        </td>
        <td className="px-2 py-2 text-xs text-tenue">
          {fila.columna}
          {fila.columna_nueva && (
            <span className="ml-1.5 rounded border border-dashed border-morado/50 px-1 text-[0.62rem] font-semibold text-morado">nueva</span>
          )}
        </td>
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

/**
 * Resumen de lo que el archivo nombra y el tablero no tiene, con las casillas
 * para crearlo (solo si se gestiona el tablero). Reemplaza el aviso repetido
 * en cada fila.
 */
function Faltantes({
  vista,
  crear,
  onCambio,
  recalculando,
}: {
  vista: VistaPrevia;
  crear: CrearFaltantes;
  onCambio: (cambio: Partial<CrearFaltantes>) => void;
  recalculando: boolean;
}) {
  const { columnas, etiquetas, primera_columna } = vista.faltantes;
  if (!columnas.length && !etiquetas.length) return null;
  const puede = vista.puede_crear;
  const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
  return (
    <div className={cn("space-y-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm", recalculando && "opacity-70")}>
      <p className="flex items-start gap-2 font-medium text-[#92400e]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        El archivo usa {[columnas.length && plural(columnas.length, "columna", "columnas"), etiquetas.length && plural(etiquetas.length, "etiqueta", "etiquetas")]
          .filter(Boolean)
          .join(" y ")}{" "}
        que este tablero no tiene.
      </p>
      {columnas.length > 0 && (
        <GrupoFaltante
          nombres={columnas}
          puede={puede}
          marcado={crear.columnas}
          onCambio={(v) => onCambio({ columnas: v })}
          textoCrear={`Crear ${plural(columnas.length, "columna", "columnas")} (antes de la columna final, dentro del Gantt)`}
          textoSin={`Sin crearlas, esas tarjetas irán a «${primera_columna}».`}
        />
      )}
      {etiquetas.length > 0 && (
        <GrupoFaltante
          nombres={etiquetas}
          puede={puede}
          marcado={crear.etiquetas}
          onCambio={(v) => onCambio({ etiquetas: v })}
          textoCrear={`Crear ${plural(etiquetas.length, "etiqueta", "etiquetas")} (cada una con su color)`}
          textoSin="Sin crearlas, no se asignan."
        />
      )}
      {!puede && (
        <p className="text-xs text-[#92400e]">
          Solo quien gestiona el tablero puede crearlas: pídeselo a un administrador o importa así.
        </p>
      )}
    </div>
  );
}

function GrupoFaltante({
  nombres,
  puede,
  marcado,
  onCambio,
  textoCrear,
  textoSin,
}: {
  nombres: string[];
  puede: boolean;
  marcado: boolean;
  onCambio: (v: boolean) => void;
  textoCrear: string;
  textoSin: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {nombres.map((n) => (
          <span key={n} className="rounded-md border border-dashed border-[#d97706]/50 bg-white px-1.5 py-px text-xs font-medium text-[#92400e]">
            {n}
          </span>
        ))}
      </div>
      {puede ? (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-texto pointer-coarse:py-1">
          <input type="checkbox" checked={marcado} onChange={(e) => onCambio(e.target.checked)} className="size-4 accent-morado" />
          {textoCrear}
        </label>
      ) : null}
      {(!puede || !marcado) && <p className="text-xs text-[#92400e]">{textoSin}</p>}
    </div>
  );
}
