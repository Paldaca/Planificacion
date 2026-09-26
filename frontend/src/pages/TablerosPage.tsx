import { Archive, ArchiveRestore, ChevronDown, LayoutGrid, LayoutTemplate, Plus, UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { useEquipos, usePersonalesArchivados, useRestaurarTablero, useTableros } from "@/api/queries";
import type { TableroResumen } from "@/api/tipos";
import { EquipoDialogo, TableroDialogo } from "@/components/equipos/Dialogos";
import { MosaicoTablero } from "@/components/equipos/MosaicoTablero";
import { AvisoInvitaciones } from "@/components/invitaciones/AvisoInvitaciones";
import { Encabezado } from "@/components/layout/Encabezado";
import { PlantillasDialogo } from "@/components/plantillas/PlantillasDialogo";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto, Vacio } from "@/components/ui/Estados";
import { useTitulo } from "@/hooks/useTitulo";

/** `undefined` = cerrado; `null` = personal; número = ese equipo. */
type NuevoTablero = number | null | undefined;

export default function TablerosPage() {
  useTitulo("Tableros");
  const { data: tableros, isLoading } = useTableros();
  const { data: equipos } = useEquipos();
  const [nuevoTablero, setNuevoTablero] = useState<NuevoTablero>(undefined);
  const [nuevoEquipo, setNuevoEquipo] = useState(false);
  const [verPlantillas, setVerPlantillas] = useState(false);
  const [plantilla, setPlantilla] = useState<number | null>(null);

  const administrables = useMemo(() => (equipos ?? []).filter((e) => e.permisos.administrar && e.mi_rol), [equipos]);

  // Ya vienen ordenados: «Mi tablero» (el más antiguo) primero.
  const personales = useMemo(() => (tableros ?? []).filter((t) => t.tipo === "personal"), [tableros]);
  const porEquipo = useMemo(() => {
    const grupos = new Map<number, { nombre: string; color: string; tableros: TableroResumen[] }>();
    for (const t of tableros ?? []) {
      if (!t.equipo) continue;
      const g = grupos.get(t.equipo.id) ?? { nombre: t.equipo.nombre, color: t.equipo.color, tableros: [] };
      g.tableros.push(t);
      grupos.set(t.equipo.id, g);
    }
    // Equipos sin tableros todavía también se muestran (para invitar a crear uno).
    for (const e of equipos ?? []) {
      if (e.mi_rol && !grupos.has(e.id)) grupos.set(e.id, { nombre: e.nombre, color: e.color, tableros: [] });
    }
    return [...grupos.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
  }, [tableros, equipos]);

  return (
    <div>
      <Encabezado
        antetitulo="Planificación"
        titulo="Tableros"
        subtitulo="Tus tableros personales y los de cada equipo al que perteneces."
        acciones={
          <>
            {porEquipo.length === 0 && (
              <Boton variante="secundario" onClick={() => setNuevoEquipo(true)}>
                <UsersRound />
                Crear un equipo
              </Boton>
            )}
            <Boton variante="secundario" onClick={() => setVerPlantillas(true)}>
              <LayoutTemplate />
              Plantillas
            </Boton>
            <Boton onClick={() => setNuevoTablero(null)}>
              <Plus />
              Nuevo tablero
            </Boton>
          </>
        }
      />

      <AvisoInvitaciones />

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-60 rounded-[22px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          <section>
            <div className="mb-3 flex items-center gap-3">
              <Etiqueta>Personales</Etiqueta>
              <span className="h-px flex-1 bg-linea/70" />
              <Boton variante="fantasma" tamano="sm" onClick={() => setNuevoTablero(null)}>
                <Plus />
                Tablero
              </Boton>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
              {personales.map((t, j) => (
                <MosaicoTablero key={t.id} tablero={t} destacado={j === 0} indice={j} />
              ))}
            </div>
            <PersonalesArchivados />
          </section>

          {porEquipo.map(([equipoId, grupo], i) => {
            const puedeCrear = administrables.some((e) => e.id === equipoId);
            return (
              <section key={equipoId} className="animate-rise" style={{ animationDelay: `${120 + i * 60}ms` }}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="size-3 rounded-full" style={{ background: grupo.color }} />
                  <Link
                    to={`/equipos/${equipoId}`}
                    className="font-display text-base font-semibold text-marino transition-colors hover:text-morado"
                  >
                    {grupo.nombre}
                  </Link>
                  <span className="h-px flex-1 bg-linea/70" />
                  {puedeCrear && (
                    <Boton variante="fantasma" tamano="sm" onClick={() => setNuevoTablero(equipoId)}>
                      <Plus />
                      Tablero
                    </Boton>
                  )}
                </div>
                {grupo.tableros.length ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
                    {grupo.tableros.map((t, j) => (
                      <MosaicoTablero key={t.id} tablero={t} indice={j} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-linea px-5 py-6 text-sm text-tenue">
                    Este equipo todavía no tiene tableros.
                    {puedeCrear && " Crea el primero con el botón «Tablero»."}
                  </p>
                )}
              </section>
            );
          })}

          {porEquipo.length === 0 && (
            <Vacio
              icono={LayoutGrid}
              titulo="Todavía no estás en ningún equipo"
              texto="Puedes organizarte con tableros personales, crear un equipo e invitar a tus compañeros, o esperar la invitación de alguien: te llegará un aviso en la campana del Portal."
              accion={
                <Boton variante="secundario" onClick={() => setNuevoEquipo(true)}>
                  <UsersRound />
                  Crear un equipo
                </Boton>
              }
            />
          )}
        </div>
      )}

      <TableroDialogo
        abierto={nuevoTablero !== undefined}
        onCerrar={() => {
          setNuevoTablero(undefined);
          setPlantilla(null);
        }}
        equipos={administrables}
        equipoInicial={nuevoTablero ?? null}
        plantillaInicial={plantilla}
      />
      <PlantillasDialogo
        abierto={verPlantillas}
        onCerrar={() => setVerPlantillas(false)}
        onUsar={(p) => {
          setVerPlantillas(false);
          setPlantilla(p.id);
          // Una plantilla de equipo propone ese equipo si se pueden crear tableros en él.
          const equipo = p.equipo && administrables.some((e) => e.id === p.equipo?.id) ? p.equipo.id : null;
          setNuevoTablero(equipo);
        }}
      />
      <EquipoDialogo abierto={nuevoEquipo} onCerrar={() => setNuevoEquipo(false)} />
    </div>
  );
}

/** Personales archivados: plegados, se cargan al desplegarlos. */
function PersonalesArchivados() {
  const [abierto, setAbierto] = useState(false);
  const { data, isLoading } = usePersonalesArchivados(abierto);
  const restaurar = useRestaurarTablero();

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-tenue transition-colors hover:bg-morado/8 hover:text-morado"
      >
        <Archive className="size-3.5" />
        Archivados
        <ChevronDown className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2">
              {isLoading ? (
                <Esqueleto className="h-12 max-w-md" />
              ) : data?.length ? (
                <ul className="max-w-md divide-y divide-linea/70 rounded-xl border border-linea bg-white">
                  {data.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                      <Link to={`/tableros/${t.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-texto hover:text-morado">
                        {t.nombre}
                      </Link>
                      <Boton
                        variante="suave"
                        tamano="sm"
                        cargando={restaurar.isPending && restaurar.variables === t.id}
                        onClick={() =>
                          restaurar.mutate(t.id, {
                            onSuccess: () => toast.success("Tablero restaurado", { description: t.nombre }),
                          })
                        }
                      >
                        <ArchiveRestore />
                        Restaurar
                      </Boton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 text-xs text-tenue">No tienes tableros personales archivados.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Etiqueta({ children }: { children: string }) {
  return <p className="animate-rise text-[0.78rem] font-semibold tracking-[0.08em] text-tenue uppercase">{children}</p>;
}
