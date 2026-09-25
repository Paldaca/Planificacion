import { LayoutGrid, Plus, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useEquipos, useTableros } from "@/api/queries";
import type { TableroResumen } from "@/api/tipos";
import { EquipoDialogo, TableroDialogo } from "@/components/equipos/Dialogos";
import { MosaicoTablero } from "@/components/equipos/MosaicoTablero";
import { AvisoInvitaciones } from "@/components/invitaciones/AvisoInvitaciones";
import { Encabezado } from "@/components/layout/Encabezado";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto, Vacio } from "@/components/ui/Estados";
import { useTitulo } from "@/hooks/useTitulo";

export default function TablerosPage() {
  useTitulo("Tableros");
  const { data: tableros, isLoading } = useTableros();
  const { data: equipos } = useEquipos();
  const [nuevoTablero, setNuevoTablero] = useState<number | null | undefined>(undefined);
  const [nuevoEquipo, setNuevoEquipo] = useState(false);

  const administrables = useMemo(() => (equipos ?? []).filter((e) => e.permisos.administrar && e.mi_rol), [equipos]);

  const personal = tableros?.find((t) => t.tipo === "personal");
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
        subtitulo="Tu tablero personal y los de cada equipo al que perteneces."
        acciones={
          administrables.length > 0 ? (
            <Boton onClick={() => setNuevoTablero(null)}>
              <Plus />
              Nuevo tablero
            </Boton>
          ) : (
            <Boton variante="secundario" onClick={() => setNuevoEquipo(true)}>
              <UsersRound />
              Crear un equipo
            </Boton>
          )
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
          {personal && (
            <section>
              <Etiqueta>Personal</Etiqueta>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
                <MosaicoTablero tablero={personal} destacado />
              </div>
            </section>
          )}

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
              texto="Crea un equipo e invita a tus compañeros, o espera la invitación de alguien: te llegará un aviso en la campana del Portal."
              accion={
                <Boton onClick={() => setNuevoEquipo(true)}>
                  <UsersRound />
                  Crear un equipo
                </Boton>
              }
            />
          )}
        </div>
      )}

      <>
        <TableroDialogo
          abierto={nuevoTablero !== undefined}
          onCerrar={() => setNuevoTablero(undefined)}
          equipos={administrables}
          equipoFijo={nuevoTablero ?? undefined}
        />
        <EquipoDialogo abierto={nuevoEquipo} onCerrar={() => setNuevoEquipo(false)} />
      </>
    </div>
  );
}

function Etiqueta({ children }: { children: string }) {
  return (
    <p className="mb-3 animate-rise text-[0.78rem] font-semibold tracking-[0.08em] text-tenue uppercase">{children}</p>
  );
}
