import { CalendarPlus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useCrearCard } from "@/api/queries";
import type { CardDetalle, TableroDetalle, Urgencia } from "@/api/tipos";
import { useIdentidad } from "@/auth/useIdentidad";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";
import { aISO, laborablesEntre, siguienteLaborableISO, sumarDiasISO, sumarLaborablesISO } from "@/lib/dias";
import { LISTA_URGENCIAS, URGENCIAS } from "@/lib/estilos";
import { hoy } from "@/lib/fechas";

const DURACION_INICIAL = 5;

const estiloSelect =
  "h-10 w-full rounded-xl border border-linea bg-white px-3 text-sm text-texto outline-none focus:border-morado/50";

/**
 * Cargar tareas desde el Gantt en un solo paso (título, responsable, fechas y
 * urgencia), sin pasar por el Kanban ni abrir la tarjeta. «Crear y añadir
 * otra» deja el formulario listo para la siguiente, que empieza el día hábil
 * después de la anterior con la misma duración: así se carga un plan en fila.
 * Las fechas propuestas cuentan de lunes a viernes; los feriados los aplica el
 * servidor en los vencimientos.
 */
export function NuevaTareaDialogo({
  tablero,
  abierto,
  onCerrar,
  onCreada,
}: {
  tablero: TableroDetalle;
  abierto: boolean;
  onCerrar: () => void;
  onCreada: (card: CardDetalle) => void;
}) {
  const identidad = useIdentidad();
  const crear = useCrearCard(tablero.id);
  const titulo = useRef<HTMLInputElement>(null);
  // Solo columnas que se ven en el Gantt (si no, la tarea «desaparecería»).
  const columnas = tablero.columnas.filter((c) => c.incluir_en_gantt && !c.es_final);
  const opciones = columnas.length ? columnas : tablero.columnas;

  const [texto, setTexto] = useState("");
  const [responsable, setResponsable] = useState<number | null>(null);
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [urgencia, setUrgencia] = useState<Urgencia>("media");
  const [columna, setColumna] = useState<number | null>(null);

  useAlAbrir(abierto, () => {
    const propuesto = siguienteLaborableISO(aISO(hoy()));
    setTexto("");
    setResponsable(tablero.personas.some((p) => p.id === identidad.id) ? identidad.id : null);
    setInicio(propuesto);
    setFin(sumarLaborablesISO(propuesto, DURACION_INICIAL - 1));
    setUrgencia("media");
    setColumna(opciones[0]?.id ?? null);
  });

  const duracion = inicio && fin && fin >= inicio ? laborablesEntre(inicio, fin) : 0;
  const valido = texto.trim() !== "" && inicio !== "" && fin !== "" && fin >= inicio && columna !== null;

  function cambiarInicio(valor: string) {
    // Conserva la duración al mover el inicio: es lo que se espera al planificar.
    if (valor && inicio && fin && duracion > 0) setFin(sumarLaborablesISO(siguienteLaborableISO(valor), duracion - 1));
    setInicio(valor);
  }

  async function guardar(otra: boolean) {
    if (!valido || crear.isPending) return;
    const card = await crear.mutateAsync({
      titulo: texto.trim(),
      columna: columna!,
      fecha_inicio: inicio,
      fecha_fin: fin,
      urgencia,
      responsables: responsable ? [responsable] : [],
    });
    onCreada(card);
    toast.success("Tarea creada", { description: `#${card.numero} ${card.titulo}` });
    if (!otra) {
      onCerrar();
      return;
    }
    // La siguiente empieza el día hábil después de esta, con la misma duración.
    const siguiente = siguienteLaborableISO(sumarDiasISO(fin, 1));
    setTexto("");
    setInicio(siguiente);
    setFin(sumarLaborablesISO(siguiente, Math.max(duracion, 1) - 1));
    titulo.current?.focus();
  }

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Nueva tarea"
      descripcion="Aparece en el Gantt al crearla."
      icono={CalendarPlus}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} className="max-sm:hidden">
            Cancelar
          </Boton>
          <Boton variante="secundario" disabled={!valido} cargando={crear.isPending} onClick={() => void guardar(true)}>
            Crear y añadir otra
          </Boton>
          <Boton disabled={!valido} cargando={crear.isPending} onClick={() => void guardar(false)}>
            Crear tarea
          </Boton>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar(false);
        }}
      >
        <Campo etiqueta="Título">
          <Entrada
            ref={titulo}
            autoFocus
            value={texto}
            maxLength={200}
            placeholder="¿Qué hay que hacer?"
            onChange={(e) => setTexto(e.target.value)}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Inicio">
            <Entrada type="date" value={inicio} onChange={(e) => cambiarInicio(e.target.value)} />
          </Campo>
          <Campo etiqueta="Fin" ayuda={duracion ? `${duracion} ${duracion === 1 ? "día hábil" : "días hábiles"}` : undefined}>
            <Entrada type="date" value={fin} min={inicio || undefined} onChange={(e) => setFin(e.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Responsable">
          <select
            value={responsable ?? ""}
            onChange={(e) => setResponsable(e.target.value ? Number(e.target.value) : null)}
            className={estiloSelect}
          >
            <option value="">Sin responsable</option>
            {tablero.personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.id === identidad.id ? " (tú)" : ""}
              </option>
            ))}
          </select>
        </Campo>
        <div className="space-y-1.5">
          <span className="text-[0.78rem] font-semibold tracking-wide text-tenue uppercase">Urgencia</span>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Urgencia">
            {LISTA_URGENCIAS.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={urgencia === u}
                onClick={() => setUrgencia(u)}
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition-colors pointer-coarse:h-10",
                  urgencia === u ? "border-transparent text-white" : "border-linea bg-white text-tenue hover:border-morado/30",
                )}
                style={urgencia === u ? { background: URGENCIAS[u].color } : undefined}
              >
                {URGENCIAS[u].etiqueta}
              </button>
            ))}
          </div>
        </div>
        {opciones.length > 1 && (
          <Campo etiqueta="Columna">
            <select value={columna ?? ""} onChange={(e) => setColumna(Number(e.target.value))} className={estiloSelect}>
              {opciones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {/* Enter en el título crea la tarea. */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialogo>
  );
}
