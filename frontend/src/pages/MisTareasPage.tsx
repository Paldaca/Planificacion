import { CalendarDays, ChevronRight, ClipboardList, Clock, LayoutGrid, PartyPopper, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMisTareas } from "@/api/queries";
import type { MisTarea } from "@/api/tipos";
import { nombreVisible, useIdentidad } from "@/auth/useIdentidad";
import { CardDialogo } from "@/components/card/CardDialogo";
import { AvisoInvitaciones } from "@/components/invitaciones/AvisoInvitaciones";
import { Encabezado } from "@/components/layout/Encabezado";
import { PilaAvatares } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto, Pildora, Vacio } from "@/components/ui/Estados";
import { useTitulo } from "@/hooks/useTitulo";
import { URGENCIAS, VENCIMIENTOS } from "@/lib/estilos";
import { diasEntre, fechaLarga, hoy, parsearDia, rangoCorto, relativoFin, saludo } from "@/lib/fechas";

type Grupo = { id: string; titulo: string; icono: typeof Clock; color: string; tareas: MisTarea[] };

function agrupar(tareas: MisTarea[]): Grupo[] {
  const d = hoy();
  const vencidas: MisTarea[] = [];
  const semana: MisTarea[] = [];
  const despues: MisTarea[] = [];
  const sinFecha: MisTarea[] = [];
  for (const t of tareas) {
    if (!t.fecha_fin) sinFecha.push(t);
    else if (t.vencimiento === "vencida") vencidas.push(t);
    else if (diasEntre(d, parsearDia(t.fecha_fin)) <= 7) semana.push(t);
    else despues.push(t);
  }
  const porUrgencia = (a: MisTarea, b: MisTarea) => URGENCIAS[b.urgencia].orden - URGENCIAS[a.urgencia].orden;
  return [
    { id: "vencidas", titulo: "Vencidas", icono: TriangleAlert, color: "#dc2626", tareas: vencidas },
    { id: "semana", titulo: "Próximos 7 días", icono: Clock, color: "#d97706", tareas: semana },
    { id: "despues", titulo: "Más adelante", icono: CalendarDays, color: "#32407b", tareas: despues },
    { id: "sin", titulo: "Sin fecha", icono: ClipboardList, color: "#5a6294", tareas: sinFecha.sort(porUrgencia) },
  ].filter((g) => g.tareas.length > 0);
}

export default function MisTareasPage() {
  useTitulo("Mis tareas");
  const identidad = useIdentidad();
  const { data: tareas, isLoading } = useMisTareas();
  const [abierta, setAbierta] = useState<{ tableroId: number; numero: number } | null>(null);

  const grupos = useMemo(() => agrupar(tareas ?? []), [tareas]);
  const vencidas = tareas?.filter((t) => t.vencimiento === "vencida").length ?? 0;
  const pronto = tareas?.filter((t) => t.vencimiento === "vence_pronto").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        antetitulo={<span className="normal-case">{fechaLarga()}</span>}
        titulo={
          <>
            {saludo()}, <span className="text-morado">{identidad.first_name || nombreVisible(identidad)}</span>
          </>
        }
        subtitulo={
          <span className="mt-1 flex flex-wrap gap-2">
            <Pildora icono={ClipboardList}>{tareas?.length ?? 0} pendientes</Pildora>
            {vencidas > 0 && (
              <Pildora icono={TriangleAlert} color="#dc2626">
                {vencidas} {vencidas === 1 ? "vencida" : "vencidas"}
              </Pildora>
            )}
            {pronto > 0 && (
              <Pildora icono={Clock} color="#d97706">
                {pronto} por vencer
              </Pildora>
            )}
          </span>
        }
        acciones={
          <Link to="/tableros">
            <Boton variante="secundario">
              <LayoutGrid />
              Ver tableros
            </Boton>
          </Link>
        }
      />

      <AvisoInvitaciones />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
      ) : grupos.length === 0 ? (
        <Vacio
          icono={PartyPopper}
          titulo="Nada pendiente por ahora"
          texto="Aquí aparecen las tarjetas donde eres responsable, de todos tus tableros. Cuando te asignen una, la verás aquí."
          accion={
            <Link to="/tableros">
              <Boton>
                <LayoutGrid />
                Ir a mis tableros
              </Boton>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {grupos.map((grupo, i) => (
            <section key={grupo.id} className="animate-rise" style={{ animationDelay: `${100 + i * 70}ms` }}>
              <h2 className="mb-3 flex items-center gap-2 font-display text-[0.98rem] font-semibold" style={{ color: grupo.color }}>
                <grupo.icono className="size-4" />
                {grupo.titulo}
                <span className="rounded-full px-2 py-0.5 text-[0.72rem]" style={{ background: `color-mix(in srgb, ${grupo.color} 10%, #fff)` }}>
                  {grupo.tareas.length}
                </span>
              </h2>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {grupo.tareas.map((t) => (
                    <motion.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <FilaTarea tarea={t} onAbrir={() => setAbierta({ tableroId: t.tablero.id, numero: t.numero })} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      )}

      {abierta && (
        <CardDialogo
          key={`${abierta.tableroId}-${abierta.numero}`}
          tableroId={abierta.tableroId}
          numero={abierta.numero}
          onCerrar={() => setAbierta(null)}
          onTrasladada={(card) => setAbierta({ tableroId: card.tablero.id, numero: card.numero })}
          onAbrirOtra={(numero) => setAbierta({ tableroId: abierta.tableroId, numero })}
          enlaceTablero={
            <Link
              to={`/tableros/${abierta.tableroId}/cards/${abierta.numero}`}
              className="ml-1 inline-flex items-center gap-0.5 font-semibold text-morado hover:underline"
            >
              Ver en el tablero
              <ChevronRight className="size-3.5" />
            </Link>
          }
        />
      )}
    </div>
  );
}

function FilaTarea({ tarea, onAbrir }: { tarea: MisTarea; onAbrir: () => void }) {
  const urgencia = URGENCIAS[tarea.urgencia];
  const venc = VENCIMIENTOS[tarea.vencimiento];
  const equipo = tarea.tablero.equipo;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-linea/80 bg-white py-3.5 pr-4 pl-5 text-left transition-[transform,box-shadow,border-color] duration-200 ease-suave hover:-translate-y-0.5 hover:border-morado/25 hover:shadow-[0_12px_26px_-16px_rgba(50,64,123,0.55)]"
    >
      <span className="absolute top-3 bottom-3 left-0 w-1 rounded-r-full" style={{ background: urgencia.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.93rem] font-medium text-texto">{tarea.titulo}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tenue">
          {equipo ? (
            <span className="inline-flex items-center gap-1 font-medium" style={{ color: equipo.color }}>
              <span className="size-2 rounded-full" style={{ background: equipo.color }} />
              {equipo.nombre}
            </span>
          ) : (
            <span className="font-medium">Personal</span>
          )}
          <span className="text-tenue/40">·</span>
          <span>{tarea.tablero.nombre}</span>
          <span className="text-tenue/40">·</span>
          <span>{tarea.columna_nombre}</span>
        </p>
      </div>
      {(tarea.urgencia === "alta" || tarea.urgencia === "critica") && (
        <Pildora color={urgencia.color} className="hidden sm:inline-flex">
          {urgencia.etiqueta}
        </Pildora>
      )}
      {tarea.fecha_fin && (
        <div className="hidden text-right sm:block">
          <p className="text-xs font-semibold" style={{ color: venc?.color }}>
            {relativoFin(tarea.fecha_fin)}
          </p>
          <p className="text-[0.7rem] text-tenue/80">{rangoCorto(tarea.fecha_inicio, tarea.fecha_fin)}</p>
        </div>
      )}
      <PilaAvatares personas={tarea.responsables} />
      <ChevronRight className="size-4 text-tenue/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-morado" />
    </button>
  );
}
