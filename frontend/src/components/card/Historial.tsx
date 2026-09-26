import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  CirclePlus,
  ListChecks,
  MessageSquare,
  MoveRight,
  Pencil,
  UserMinus,
  UserPlus,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";

import { useActividad } from "@/api/queries";
import type { Actividad, Urgencia } from "@/api/tipos";
import { Avatar } from "@/components/ui/Avatar";
import { Esqueleto } from "@/components/ui/Estados";
import { URGENCIAS } from "@/lib/estilos";
import { diaCorto, haceCuanto } from "@/lib/fechas";

const ICONOS: Record<Actividad["accion"], LucideIcon> = {
  creo: CirclePlus,
  movio: MoveRight,
  edito: Pencil,
  asigno: UserPlus,
  desasigno: UserMinus,
  comento: MessageSquare,
  checklist: ListChecks,
  archivo: Archive,
  restauro: ArchiveRestore,
  traslado: ArrowRightLeft,
  dependencia: Waypoints,
};

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const lista = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");

function frase(a: Actividad): string {
  const d = a.detalle;
  switch (a.accion) {
    case "creo":
      return `creó la tarjeta en ${texto(d.columna)}`;
    case "movio":
      return `la movió de ${texto(d.desde)} a ${texto(d.hacia)}`;
    case "asigno":
      return `asignó a ${lista(d.personas)}`;
    case "desasigno":
      return `quitó a ${lista(d.personas)}`;
    case "comento":
      return "comentó";
    case "archivo":
      return "archivó la tarjeta";
    case "restauro":
      return "restauró la tarjeta";
    case "traslado":
      return `la trasladó de ${texto(d.desde)} a ${texto(d.hacia)}`;
    case "dependencia":
      return texto(d.cambio) === "quito"
        ? `quitó la dependencia de «${texto(d.despues_de)}»`
        : `hizo que vaya después de «${texto(d.despues_de)}»`;
    case "checklist": {
      const item = `«${texto(d.texto)}»`;
      return {
        agrego: `agregó ${item} al checklist`,
        marco: `completó ${item}`,
        desmarco: `reabrió ${item}`,
        elimino: `quitó ${item} del checklist`,
      }[texto(d.cambio)] ?? "cambió el checklist";
    }
    case "edito": {
      const despues = texto(d.despues);
      switch (texto(d.campo)) {
        case "titulo":
          return `cambió el título a «${despues}»`;
        case "descripcion":
          return "editó la descripción";
        case "urgencia":
          return `cambió la urgencia a ${URGENCIAS[despues as Urgencia]?.etiqueta ?? despues}`;
        case "fecha_inicio":
          return despues ? `puso la fecha de inicio el ${diaCorto(despues)}` : "quitó la fecha de inicio";
        case "fecha_fin":
          return despues ? `puso la fecha final el ${diaCorto(despues)}` : "quitó la fecha final";
        case "en_gantt":
          return "cambió si aparece en el Gantt";
        case "etiquetas":
          return fraseEtiquetas(texto(d.antes), despues);
        case "personalizado":
          return despues ? `puso «${texto(d.nombre)}» en ${despues}` : `vació «${texto(d.nombre)}»`;
        default:
          return "editó la tarjeta";
      }
    }
  }
}

/** Las etiquetas se registran como nombres separados por coma, antes y después. */
function fraseEtiquetas(antes: string, despues: string): string {
  const separar = (t: string) => (t ? t.split(", ") : []);
  const previas = separar(antes);
  const nuevas = separar(despues);
  const puestas = nuevas.filter((e) => !previas.includes(e));
  const quitadas = previas.filter((e) => !nuevas.includes(e));
  const citar = (l: string[]) => l.map((e) => `«${e}»`).join(", ");
  if (puestas.length && !quitadas.length) return `puso la etiqueta${puestas.length > 1 ? "s" : ""} ${citar(puestas)}`;
  if (quitadas.length && !puestas.length) return `quitó la etiqueta${quitadas.length > 1 ? "s" : ""} ${citar(quitadas)}`;
  return "cambió las etiquetas";
}

export function Historial({ cardId }: { cardId: number }) {
  const { data, isLoading } = useActividad(cardId, true);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Esqueleto className="h-9" />
        <Esqueleto className="h-9" />
        <Esqueleto className="h-9" />
      </div>
    );
  }
  if (!data?.length) {
    return <p className="rounded-xl bg-fondo px-4 py-5 text-center text-sm text-tenue">Sin actividad registrada.</p>;
  }

  return (
    <ol className="relative space-y-1 before:absolute before:top-3 before:bottom-3 before:left-[17px] before:w-px before:bg-linea">
      {data.map((a, i) => {
        const Icono = ICONOS[a.accion];
        return (
          <motion.li
            key={a.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.025 }}
            className="relative flex items-start gap-3 py-1.5"
          >
            <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-linea bg-white text-morado">
              <Icono className="size-4" />
            </span>
            <p className="min-w-0 flex-1 pt-2 text-sm leading-snug text-texto">
              {a.actor && (
                <span className="mr-1 inline-flex translate-y-0.5 items-center gap-1.5 font-semibold">
                  <Avatar persona={a.actor} tamano="xs" conTooltip={false} />
                  {a.actor.nombre}
                </span>
              )}
              <span className="text-tenue">{frase(a)}</span>
              <span className="ml-2 text-xs whitespace-nowrap text-tenue/70" title={new Date(a.creado_en).toLocaleString("es-VE")}>
                {haceCuanto(a.creado_en)}
              </span>
            </p>
          </motion.li>
        );
      })}
    </ol>
  );
}
