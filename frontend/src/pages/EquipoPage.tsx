import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Crown,
  Ellipsis,
  LayoutGrid,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Plus,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import {
  useArchivarEquipo,
  useCambiarRol,
  useCancelarInvitacion,
  useEquipo,
  useInvitacionesEquipo,
  useMiembros,
  useQuitarMiembro,
  useSalirEquipo,
  useTablerosEquipo,
} from "@/api/queries";
import type { Equipo, Miembro, RolEquipo } from "@/api/tipos";
import { EquipoDialogo, TableroDialogo } from "@/components/equipos/Dialogos";
import { InvitarDialogo } from "@/components/equipos/InvitarDialogo";
import { MosaicoTablero } from "@/components/equipos/MosaicoTablero";
import { Encabezado } from "@/components/layout/Encabezado";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Dialogo } from "@/components/ui/Dialogo";
import { Esqueleto, Pildora, Vacio } from "@/components/ui/Estados";
import { ItemMenu, Menu, SeparadorMenu } from "@/components/ui/Menu";
import { useTitulo } from "@/hooks/useTitulo";
import { cn } from "@/lib/cn";
import { haceCuanto } from "@/lib/fechas";
import { ROLES } from "@/lib/estilos";

type Pestana = "miembros" | "tableros" | "invitaciones";

export default function EquipoPage() {
  const id = Number(useParams().equipoId);
  const navigate = useNavigate();
  const { data: equipo, error, isLoading } = useEquipo(id);
  const [pestana, setPestana] = useState<Pestana>("miembros");
  const [invitando, setInvitando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nuevoTablero, setNuevoTablero] = useState(false);
  const [confirmar, setConfirmar] = useState<"archivar" | "salir" | null>(null);
  const archivar = useArchivarEquipo(id);
  const salir = useSalirEquipo(id);

  useTitulo(equipo?.nombre);

  if (error) {
    return (
      <Vacio
        icono={Lock}
        titulo={error instanceof ApiError && error.status === 403 ? "No perteneces a este equipo" : "Equipo no encontrado"}
        texto="Si deberías estar aquí, pide a un administrador del equipo que te invite."
        accion={
          <Link to="/equipos">
            <Boton variante="secundario">
              <ArrowLeft />
              Mis equipos
            </Boton>
          </Link>
        }
      />
    );
  }
  if (isLoading || !equipo) {
    return (
      <div className="space-y-4">
        <Esqueleto className="h-4 w-32" />
        <Esqueleto className="h-10 w-72" />
        <Esqueleto className="h-64 rounded-[22px]" />
      </div>
    );
  }

  const admin = equipo.permisos.administrar;
  const pestanas: { id: Pestana; etiqueta: string; icono: typeof UsersRound; contador?: number | null }[] = [
    { id: "miembros", etiqueta: "Miembros", icono: UsersRound, contador: equipo.num_miembros },
    { id: "tableros", etiqueta: "Tableros", icono: LayoutGrid, contador: equipo.num_tableros },
    ...(admin ? [{ id: "invitaciones" as const, etiqueta: "Invitaciones", icono: Mail, contador: equipo.invitaciones_pendientes }] : []),
  ];

  return (
    <div>
      <Encabezado
        antetitulo={
          <Link to="/equipos" className="inline-flex items-center gap-1 transition-colors hover:text-morado">
            <ArrowLeft className="size-3.5" />
            Equipos
          </Link>
        }
        titulo={
          <span className="inline-flex items-center gap-3">
            <span
              className="flex size-11 items-center justify-center rounded-2xl font-display text-lg text-white shadow-[0_8px_18px_-8px_var(--sombra)]"
              style={{ background: equipo.color, ["--sombra" as string]: equipo.color }}
            >
              {equipo.nombre.slice(0, 1).toUpperCase()}
            </span>
            {equipo.nombre}
          </span>
        }
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {equipo.descripcion && <span>{equipo.descripcion}</span>}
            {equipo.mi_rol && (
              <Pildora icono={equipo.mi_rol === "administrador" ? Crown : undefined} color={equipo.color}>
                {ROLES[equipo.mi_rol]}
              </Pildora>
            )}
          </span>
        }
        acciones={
          <>
            {admin && (
              <Boton onClick={() => setInvitando(true)} style={{ background: equipo.color }}>
                <UserPlus />
                Invitar
              </Boton>
            )}
            <Menu
              disparador={
                <Boton variante="secundario" tamano="icono" aria-label="Opciones del equipo">
                  <Ellipsis />
                </Boton>
              }
            >
              {admin && (
                <ItemMenu icono={Pencil} onSelect={() => setEditando(true)}>
                  Editar equipo
                </ItemMenu>
              )}
              {equipo.mi_rol && (
                <ItemMenu icono={LogOut} onSelect={() => setConfirmar("salir")}>
                  Salir del equipo
                </ItemMenu>
              )}
              {admin && (
                <>
                  <SeparadorMenu />
                  <ItemMenu icono={Archive} peligro onSelect={() => setConfirmar("archivar")}>
                    Archivar equipo
                  </ItemMenu>
                </>
              )}
            </Menu>
          </>
        }
      />

      <div className="mb-6 flex animate-rise gap-1 border-b border-linea [animation-delay:80ms]" role="tablist">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={cn(
              "relative flex items-center gap-2 px-4 pb-3 text-sm font-semibold transition-colors",
              pestana === p.id ? "text-marino" : "text-tenue hover:text-morado",
            )}
          >
            <p.icono className="size-4" />
            {p.etiqueta}
            {p.contador ? (
              <span className="rounded-full bg-columna px-1.5 py-0.5 text-[0.68rem] text-tenue">{p.contador}</span>
            ) : null}
            {pestana === p.id && (
              <motion.span
                layoutId="pestana-equipo"
                className="absolute inset-x-2 -bottom-px h-[3px] rounded-full"
                style={{ background: equipo.color }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={pestana}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {pestana === "miembros" && <PestanaMiembros equipo={equipo} onInvitar={() => setInvitando(true)} />}
          {pestana === "tableros" && <PestanaTableros equipo={equipo} onNuevo={() => setNuevoTablero(true)} />}
          {pestana === "invitaciones" && admin && <PestanaInvitaciones equipo={equipo} onInvitar={() => setInvitando(true)} />}
        </motion.div>
      </AnimatePresence>

      <InvitarDialogo equipo={equipo} abierto={invitando} onCerrar={() => setInvitando(false)} />
      <EquipoDialogo abierto={editando} onCerrar={() => setEditando(false)} equipo={equipo} />
      <TableroDialogo abierto={nuevoTablero} onCerrar={() => setNuevoTablero(false)} equipos={[equipo]} equipoFijo={equipo.id} />

      <Dialogo
        abierto={confirmar !== null}
        onCambio={(v) => !v && setConfirmar(null)}
        titulo={confirmar === "salir" ? "¿Salir del equipo?" : "¿Archivar el equipo?"}
        descripcion={
          confirmar === "salir"
            ? "Dejarás de ver sus tableros. Para volver necesitarás una nueva invitación."
            : "El equipo y sus tableros dejan de aparecer para todos sus miembros. Nada se borra."
        }
        icono={confirmar === "salir" ? LogOut : Archive}
        color="#dc2626"
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setConfirmar(null)}>
              Cancelar
            </Boton>
            <Boton
              className="bg-[#dc2626] hover:bg-[#b91c1c]"
              cargando={archivar.isPending || salir.isPending}
              onClick={() => {
                const accion = confirmar === "salir" ? salir : archivar;
                accion.mutate(undefined, {
                  onSuccess: () => {
                    toast(confirmar === "salir" ? `Saliste de ${equipo.nombre}` : `${equipo.nombre} archivado`);
                    navigate("/equipos");
                  },
                  onSettled: () => setConfirmar(null),
                });
              }}
            >
              {confirmar === "salir" ? "Salir" : "Archivar"}
            </Boton>
          </>
        }
      >
        <p className="text-sm text-tenue">Esta acción se puede revertir desde el administrador si hiciera falta.</p>
      </Dialogo>
    </div>
  );
}

function PestanaMiembros({ equipo, onInvitar }: { equipo: Equipo; onInvitar: () => void }) {
  const { data: miembros, isLoading } = useMiembros(equipo.id);
  const cambiarRol = useCambiarRol(equipo.id);
  const quitar = useQuitarMiembro(equipo.id);
  const [aQuitar, setAQuitar] = useState<Miembro | null>(null);
  const admin = equipo.permisos.administrar;

  if (isLoading) return <Esqueleto className="h-48 rounded-[22px]" />;

  return (
    <div className="overflow-hidden rounded-[22px] border border-linea bg-white">
      <ul className="divide-y divide-linea/70">
        <AnimatePresence initial={false}>
          {miembros?.map((m, i) => (
            <motion.li
              key={m.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
              exit={{ opacity: 0, x: 30 }}
              className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-fondo/70"
            >
              <Avatar persona={m.persona} tamano="md" conTooltip={false} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-semibold text-texto">
                  {m.persona.nombre}
                  {m.es_yo && <Pildora>Tú</Pildora>}
                </p>
                <p className="truncate text-xs text-tenue">
                  {m.persona.disciplina ?? m.persona.email}
                  {m.agregado_por && !m.es_yo && ` · invitado por ${m.agregado_por.nombre}`}
                </p>
              </div>
              {admin ? (
                <SelectorRol
                  id={m.id}
                  rol={m.rol}
                  color={equipo.color}
                  onCambio={(rol) =>
                    cambiarRol.mutate(
                      { miembroId: m.id, rol },
                      { onSuccess: () => toast.success(`${m.persona.nombre} ahora es ${ROLES[rol].toLowerCase()}`) },
                    )
                  }
                />
              ) : (
                <Pildora icono={m.rol === "administrador" ? Crown : undefined}>{ROLES[m.rol]}</Pildora>
              )}
              {admin && !m.es_yo && (
                <Boton variante="fantasma" tamano="icono-sm" aria-label={`Quitar a ${m.persona.nombre}`} onClick={() => setAQuitar(m)}>
                  <UserMinus />
                </Boton>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {admin && (
        <button
          type="button"
          onClick={onInvitar}
          className="flex w-full items-center justify-center gap-2 border-t border-linea/70 px-5 py-3.5 text-sm font-semibold text-morado transition-colors hover:bg-morado/5"
        >
          <Plus className="size-4" />
          Invitar a alguien más
        </button>
      )}

      <Dialogo
        abierto={aQuitar !== null}
        onCambio={(v) => !v && setAQuitar(null)}
        titulo={`¿Quitar a ${aQuitar?.persona.nombre ?? ""}?`}
        descripcion="Dejará de ver los tableros del equipo. Sus tarjetas y comentarios se conservan."
        icono={UserMinus}
        color="#dc2626"
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setAQuitar(null)}>
              Cancelar
            </Boton>
            <Boton
              className="bg-[#dc2626] hover:bg-[#b91c1c]"
              cargando={quitar.isPending}
              onClick={() => aQuitar && quitar.mutate(aQuitar.id, { onSettled: () => setAQuitar(null) })}
            >
              Quitar del equipo
            </Boton>
          </>
        }
      >
        <p className="text-sm text-tenue">Podrás invitarle de nuevo más adelante.</p>
      </Dialogo>
    </div>
  );
}

function SelectorRol({ id, rol, color, onCambio }: { id: number; rol: RolEquipo; color: string; onCambio: (r: RolEquipo) => void }) {
  const roles: RolEquipo[] = ["administrador", "miembro", "lector"];
  return (
    <div className="hidden items-center gap-0.5 rounded-xl border border-linea bg-white p-0.5 sm:flex">
      {roles.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => r !== rol && onCambio(r)}
          className={cn(
            "relative rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
            r === rol ? "text-white" : "text-tenue hover:text-texto",
          )}
        >
          {r === rol && (
            <motion.span
              layoutId={`rol-${id}`}
              className="absolute inset-0 rounded-lg"
              style={{ background: color }}
            />
          )}
          <span className="relative">{ROLES[r]}</span>
        </button>
      ))}
    </div>
  );
}

function PestanaTableros({ equipo, onNuevo }: { equipo: Equipo; onNuevo: () => void }) {
  const { data: tableros, isLoading } = useTablerosEquipo(equipo.id);
  const admin = equipo.permisos.administrar;
  if (isLoading) return <Esqueleto className="h-56 rounded-[22px]" />;
  const activos = tableros?.filter((t) => !t.archivado) ?? [];
  const archivados = tableros?.filter((t) => t.archivado) ?? [];

  return (
    <div className="space-y-8">
      {activos.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          {activos.map((t, i) => (
            <MosaicoTablero key={t.id} tablero={t} indice={i} />
          ))}
          {admin && (
            <button
              type="button"
              onClick={onNuevo}
              className="group flex min-h-56 flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-linea text-sm font-semibold text-tenue transition-all duration-200 hover:border-morado/40 hover:bg-white hover:text-morado"
            >
              <Plus className="size-6 transition-transform duration-200 group-hover:rotate-90" />
              Nuevo tablero
            </button>
          )}
        </div>
      ) : (
        <Vacio
          icono={LayoutGrid}
          titulo="Sin tableros todavía"
          texto={admin ? "Crea el primero: empieza con las columnas Tareas, En curso y Hecho." : "Un administrador del equipo puede crear el primero."}
          accion={
            admin && (
              <Boton onClick={onNuevo}>
                <Plus />
                Nuevo tablero
              </Boton>
            )
          }
        />
      )}
      {admin && archivados.length > 0 && <TablerosArchivados tableros={archivados} />}
    </div>
  );
}

function TablerosArchivados({ tableros }: { tableros: { id: number; nombre: string }[] }) {
  return (
    <section>
      <p className="mb-2 text-[0.78rem] font-semibold tracking-[0.08em] text-tenue uppercase">Archivados</p>
      <ul className="flex flex-wrap gap-2">
        {tableros.map((t) => (
          <li key={t.id}>
            <Link
              to={`/tableros/${t.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-linea bg-white px-3 py-2 text-sm text-tenue transition-colors hover:border-morado/30 hover:text-morado"
            >
              <ArchiveRestore className="size-4" />
              {t.nombre}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PestanaInvitaciones({ equipo, onInvitar }: { equipo: Equipo; onInvitar: () => void }) {
  const { data: invitaciones, isLoading } = useInvitacionesEquipo(equipo.id, true);
  const cancelar = useCancelarInvitacion(equipo.id);
  if (isLoading) return <Esqueleto className="h-40 rounded-[22px]" />;

  if (!invitaciones?.length) {
    return (
      <Vacio
        icono={Mail}
        titulo="No hay invitaciones pendientes"
        texto="Cuando invites a alguien, aparecerá aquí hasta que acepte o rechace."
        accion={
          <Boton onClick={onInvitar}>
            <UserPlus />
            Invitar
          </Boton>
        }
      />
    );
  }
  return (
    <ul className="space-y-2.5">
      <AnimatePresence initial={false}>
        {invitaciones.map((inv) => (
          <motion.li
            key={inv.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className="flex items-center gap-4 rounded-2xl border border-linea bg-white px-5 py-3.5"
          >
            <Avatar persona={inv.invitado} tamano="md" conTooltip={false} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-texto">{inv.invitado.nombre}</p>
              <p className="truncate text-xs text-tenue">
                Como {ROLES[inv.rol].toLowerCase()} · {inv.invitado_por ? `por ${inv.invitado_por.nombre} · ` : ""}
                {haceCuanto(inv.creada_en)}
              </p>
            </div>
            <Pildora color="#d97706">Esperando respuesta</Pildora>
            <Boton
              variante="fantasma"
              tamano="sm"
              cargando={cancelar.isPending && cancelar.variables === inv.id}
              onClick={() => cancelar.mutate(inv.id, { onSuccess: () => toast("Invitación cancelada") })}
            >
              Cancelar
            </Boton>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
