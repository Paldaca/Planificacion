import { CalendarPlus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useCrearCard, useCrearDependencia } from "@/api/queries";
import type { CardDetalle, CardResumen, TableroDetalle, Urgencia } from "@/api/tipos";
import { useIdentidad } from "@/auth/useIdentidad";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";
import { aISO, laborablesEntre, siguienteLaborableISO, sumarDiasISO, sumarLaborablesISO } from "@/lib/dias";
import { LISTA_URGENCIAS, URGENCIAS } from "@/lib/estilos";
import { diaCorto, hoy } from "@/lib/fechas";

const DURACION_INICIAL = 5;

const estiloSelect =
  "h-10 w-full rounded-xl border border-linea bg-white px-3 text-sm text-texto outline-none focus:border-morado/50";

/**
 * Cargar tareas en un solo paso (título, responsable, fechas y urgencia), sin
 * pasar por el Kanban ni abrir la tarjeta. Lo usan el Gantt y el Calendario
 * (`origen`). Las fechas propuestas cuentan de lunes a viernes; los feriados
 * los aplica el servidor en los vencimientos.
 *
 * - Gantt: «Crear y añadir otra» deja lista la siguiente, que empieza el día
 *   hábil después de la anterior con la misma duración (un plan en fila).
 *   «Empieza después de» la crea como sucesora: tras crear la tarjeta se crea
 *   la dependencia fin → inicio (las reglas las valida el servidor); con
 *   predecesora, «Crear y añadir otra» encadena tras la recién creada. Solo
 *   ofrece columnas que entran en el Gantt (si no, la tarea «desaparecería»).
 * - Calendario: abre con el día (o los días) elegidos en `fechas`, y «Crear y
 *   añadir otra» conserva esas fechas (varias tareas el mismo día).
 * - Campos de lista del tablero (p. ej. «Fase»): se eligen en el mismo paso.
 *   Con «Empieza después de» toman el valor de la anterior si están vacíos
 *   (una tarea que sigue a otra suele ser de su misma fase), y «Crear y añadir
 *   otra» los conserva. No se adivina por el nombre: valen todos los de lista.
 */
export function NuevaTareaDialogo({
  tablero,
  abierto,
  onCerrar,
  onCreada,
  despuesDe = null,
  origen = "gantt",
  fechas = null,
}: {
  tablero: TableroDetalle;
  abierto: boolean;
  origen?: "gantt" | "calendario";
  /** Inicio y fin con que abre (el día o los días elegidos en el calendario). */
  fechas?: { inicio: string; fin: string } | null;
  /** Predecesora propuesta al abrir (desde el «+» de una fila del Gantt). */
  despuesDe?: number | null;
  onCerrar: () => void;
  onCreada?: (card: CardDetalle) => void;
}) {
  const identidad = useIdentidad();
  const crear = useCrearCard(tablero.id);
  const crearDependencia = useCrearDependencia(tablero.id);
  const titulo = useRef<HTMLInputElement>(null);
  const enGantt = origen === "gantt";
  const columnas = tablero.columnas.filter((c) => !c.es_final && (!enGantt || c.incluir_en_gantt));
  const opciones = columnas.length ? columnas : tablero.columnas;

  const [texto, setTexto] = useState("");
  const [responsable, setResponsable] = useState<number | null>(null);
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [urgencia, setUrgencia] = useState<Urgencia>("media");
  const [columna, setColumna] = useState<number | null>(null);
  const [predecesora, setPredecesora] = useState<number | null>(null);
  /** Valores de los campos de lista: {"<id del campo>": opción}. */
  const [valores, setValores] = useState<Record<string, string>>({});
  const camposLista = tablero.campos.filter((c) => c.tipo === "lista" && !c.archivado);

  /** Los valores de lista de `card` que siguen siendo opciones válidas. */
  const valoresDe = (card: CardResumen | undefined): Record<string, string> => {
    const copia: Record<string, string> = {};
    for (const campo of camposLista) {
      const valor = card?.campos[String(campo.id)];
      if (typeof valor === "string" && campo.opciones.includes(valor)) copia[String(campo.id)] = valor;
    }
    return copia;
  };

  // Candidatas a predecesora: las del Gantt con fecha de fin, sin mirar los
  // filtros (la recién creada debe poder elegirse aunque un filtro la oculte).
  const candidatas = tablero.cards
    .filter((c) => c.en_gantt_efectivo && c.fecha_fin)
    .sort((a, b) => (a.fecha_inicio ?? "").localeCompare(b.fecha_inicio ?? "") || a.numero - b.numero);
  const anterior = candidatas.find((c) => c.id === predecesora);

  useAlAbrir(abierto, () => {
    const previa = candidatas.find((c) => c.id === despuesDe);
    const propuesto = previa ? inicioTras(previa) : siguienteLaborableISO(aISO(hoy()));
    setTexto("");
    setResponsable(tablero.personas.some((p) => p.id === identidad.id) ? identidad.id : null);
    setInicio(fechas?.inicio ?? propuesto);
    setFin(fechas?.fin ?? sumarLaborablesISO(propuesto, DURACION_INICIAL - 1));
    setUrgencia("media");
    setColumna(opciones[0]?.id ?? null);
    setPredecesora(previa?.id ?? null);
    setValores(valoresDe(previa));
  });

  const duracion = inicio && fin && fin >= inicio ? laborablesEntre(inicio, fin) : 0;
  const valido = texto.trim() !== "" && inicio !== "" && fin !== "" && fin >= inicio && columna !== null;
  const guardando = crear.isPending || crearDependencia.isPending;
  // Aviso, no bloqueo: el servidor la acepta y el Gantt la marca incumplida.
  const antesDeTiempo = anterior?.fecha_fin && inicio && inicio <= anterior.fecha_fin;

  function cambiarInicio(valor: string) {
    // Conserva la duración al mover el inicio: es lo que se espera al planificar.
    if (valor && inicio && fin && duracion > 0) setFin(sumarLaborablesISO(siguienteLaborableISO(valor), duracion - 1));
    setInicio(valor);
  }

  function elegirPredecesora(id: number | null) {
    setPredecesora(id);
    const card = candidatas.find((c) => c.id === id);
    if (card) cambiarInicio(inicioTras(card));
    // Lo que ya se eligió a mano no se pisa.
    if (card) setValores((actuales) => ({ ...valoresDe(card), ...actuales }));
  }

  async function guardar(otra: boolean) {
    if (!valido || guardando) return;
    const card = await crear.mutateAsync({
      titulo: texto.trim(),
      columna: columna!,
      fecha_inicio: inicio,
      fecha_fin: fin,
      urgencia,
      responsables: responsable ? [responsable] : [],
      ...(Object.keys(valores).length ? { campos: valores } : {}),
    });
    if (anterior) {
      // Si falla, la tarjeta ya existe: el error lo avisa el hook y se puede
      // enlazar a mano desde el Gantt.
      await crearDependencia.mutateAsync({ predecesora: anterior.id, sucesora: card.id }).catch(() => undefined);
    }
    onCreada?.(card);
    toast.success("Tarea creada", {
      description: anterior ? `#${card.numero} ${card.titulo}, después de #${anterior.numero}` : `#${card.numero} ${card.titulo}`,
    });
    if (!otra) {
      onCerrar();
      return;
    }
    setTexto("");
    titulo.current?.focus();
    if (!enGantt) return; // En el calendario, la siguiente va en los mismos días.
    // La siguiente empieza el día hábil después de esta, con la misma duración.
    const siguiente = siguienteLaborableISO(sumarDiasISO(fin, 1));
    setInicio(siguiente);
    setFin(sumarLaborablesISO(siguiente, Math.max(duracion, 1) - 1));
    if (anterior) setPredecesora(card.id);
  }

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Nueva tarea"
      descripcion={enGantt ? "Aparece en el Gantt al crearla." : "Aparece en el calendario al crearla."}
      icono={CalendarPlus}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} className="max-sm:hidden">
            Cancelar
          </Boton>
          <Boton variante="secundario" disabled={!valido} cargando={guardando} onClick={() => void guardar(true)}>
            Crear y añadir otra
          </Boton>
          <Boton disabled={!valido} cargando={guardando} onClick={() => void guardar(false)}>
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
        {enGantt && candidatas.length > 0 && (
          <Campo
            etiqueta="Empieza después de"
            ayuda={
              antesDeTiempo ? (
                <span className="text-[#b45309]">Empieza antes de que termine la anterior: la flecha quedará en rojo.</span>
              ) : anterior ? (
                "Quedan unidas con una flecha: esta va después de la anterior."
              ) : undefined
            }
          >
            <select
              value={predecesora ?? ""}
              onChange={(e) => elegirPredecesora(e.target.value ? Number(e.target.value) : null)}
              className={estiloSelect}
            >
              <option value="">Ninguna (tarea suelta)</option>
              {candidatas.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.numero} {c.titulo} · termina {diaCorto(c.fecha_fin)}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {camposLista.map((campo) => (
          <Campo key={campo.id} etiqueta={campo.nombre}>
            <select
              value={valores[String(campo.id)] ?? ""}
              onChange={(e) =>
                setValores((actuales) => {
                  const nuevos = { ...actuales };
                  if (e.target.value) nuevos[String(campo.id)] = e.target.value;
                  else delete nuevos[String(campo.id)];
                  return nuevos;
                })
              }
              className={estiloSelect}
            >
              <option value="">—</option>
              {campo.opciones.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Campo>
        ))}
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

/** Primer día hábil (lunes a viernes) después de que termine `card`. */
function inicioTras(card: CardResumen): string {
  return siguienteLaborableISO(sumarDiasISO(card.fecha_fin!, 1));
}
