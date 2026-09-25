import { ArrowRight, Crown, LayoutGrid, Plus, UsersRound } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { useEquipos } from "@/api/queries";
import type { Equipo } from "@/api/tipos";
import { EquipoDialogo } from "@/components/equipos/Dialogos";
import { AvisoInvitaciones } from "@/components/invitaciones/AvisoInvitaciones";
import { Encabezado } from "@/components/layout/Encabezado";
import { PilaAvatares } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto, Pildora, Vacio } from "@/components/ui/Estados";
import { useTitulo } from "@/hooks/useTitulo";
import { ROLES } from "@/lib/estilos";

export default function EquiposPage() {
  useTitulo("Equipos");
  const { data: equipos, isLoading } = useEquipos();
  const [nuevo, setNuevo] = useState(false);

  return (
    <div>
      <Encabezado
        antetitulo="Planificación"
        titulo="Equipos"
        subtitulo="Crea equipos e invita a tus compañeros. Cada equipo puede tener varios tableros."
        acciones={
          <Boton onClick={() => setNuevo(true)}>
            <Plus />
            Nuevo equipo
          </Boton>
        }
      />

      <AvisoInvitaciones />

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-56 rounded-[22px]" />
          ))}
        </div>
      ) : equipos && equipos.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {equipos.map((e, i) => (
            <MosaicoEquipo key={e.id} equipo={e} indice={i} />
          ))}
        </div>
      ) : (
        <Vacio
          icono={UsersRound}
          titulo="Aún no tienes equipos"
          texto="Un equipo reúne a las personas que trabajan juntas. Tú serás su administrador y podrás invitar a los demás."
          accion={
            <Boton onClick={() => setNuevo(true)}>
              <Plus />
              Crear mi primer equipo
            </Boton>
          }
        />
      )}

      <EquipoDialogo abierto={nuevo} onCerrar={() => setNuevo(false)} />
    </div>
  );
}

function MosaicoEquipo({ equipo, indice }: { equipo: Equipo; indice: number }) {
  return (
    <Link
      to={`/equipos/${equipo.id}`}
      style={{ "--acento": equipo.color, animationDelay: `${indice * 70}ms` } as CSSProperties}
      className="group relative flex animate-rise flex-col gap-4 overflow-hidden rounded-[22px] border border-linea bg-white p-6 transition-[transform,box-shadow,border-color] duration-200 ease-suave before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:origin-left before:scale-x-0 before:bg-[var(--acento)] before:transition-transform before:duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--acento)_28%,#d8dcf0)] hover:shadow-[0_14px_30px_-14px_color-mix(in_srgb,var(--acento)_45%,transparent)] hover:before:scale-x-100"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--acento)_10%,#fff)] font-display text-lg font-bold text-[var(--acento)] transition-all duration-200 group-hover:scale-105 group-hover:-rotate-3 group-hover:bg-[var(--acento)] group-hover:text-white">
          {equipo.nombre.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {equipo.mi_rol ? (
            <Pildora icono={equipo.mi_rol === "administrador" ? Crown : undefined} color={equipo.mi_rol === "administrador" ? equipo.color : undefined}>
              {ROLES[equipo.mi_rol]}
            </Pildora>
          ) : (
            <Pildora>Supervisión</Pildora>
          )}
          {equipo.invitaciones_pendientes ? (
            <Pildora color="#d97706">{equipo.invitaciones_pendientes} por aceptar</Pildora>
          ) : null}
        </div>
      </div>
      <div>
        <h3 className="font-display text-[1.15rem] font-semibold text-marino">{equipo.nombre}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.6em] text-sm leading-relaxed text-tenue">
          {equipo.descripcion || "Sin descripción."}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <PilaAvatares personas={equipo.miembros} max={5} tamano="sm" />
        <span className="flex items-center gap-3 text-xs font-medium text-tenue">
          <span className="flex items-center gap-1">
            <UsersRound className="size-3.5" />
            {equipo.num_miembros}
          </span>
          <span className="flex items-center gap-1">
            <LayoutGrid className="size-3.5" />
            {equipo.num_tableros}
          </span>
        </span>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--acento)]">
        Ver equipo
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
