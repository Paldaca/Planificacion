import { Check, Mail, MailOpen, UsersRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useMisInvitaciones, useResponderInvitacion } from "@/api/queries";
import type { Invitacion } from "@/api/tipos";
import { Encabezado } from "@/components/layout/Encabezado";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Esqueleto, Pildora, Vacio } from "@/components/ui/Estados";
import { useTitulo } from "@/hooks/useTitulo";
import { ROLES } from "@/lib/estilos";
import { haceCuanto } from "@/lib/fechas";

export default function InvitacionesPage() {
  useTitulo("Invitaciones");
  const { data: invitaciones, isLoading } = useMisInvitaciones();

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        antetitulo="Planificación"
        titulo="Invitaciones"
        subtitulo="Nadie entra a un equipo sin decidirlo: acepta las que te interesen."
      />

      {isLoading ? (
        <div className="space-y-4">
          <Esqueleto className="h-44 rounded-[22px]" />
          <Esqueleto className="h-44 rounded-[22px]" />
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            <AnimatePresence initial={false}>
              {invitaciones?.map((inv, i) => (
                <motion.li
                  key={inv.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.25 } }}
                >
                  <TarjetaInvitacion invitacion={inv} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {!invitaciones?.length && (
            <Vacio
              icono={MailOpen}
              titulo="No tienes invitaciones pendientes"
              texto="Cuando alguien te invite a un equipo, te llegará un aviso en la campana del Portal y la verás aquí."
            />
          )}
        </>
      )}
    </div>
  );
}

function TarjetaInvitacion({ invitacion }: { invitacion: Invitacion }) {
  const navigate = useNavigate();
  const responder = useResponderInvitacion();
  const { equipo } = invitacion;
  const pendiente = responder.isPending ? responder.variables?.aceptar : undefined;

  function contestar(aceptar: boolean) {
    responder.mutate(
      { id: invitacion.id, aceptar },
      {
        onSuccess: () => {
          if (aceptar) {
            toast.success(`Te uniste a ${equipo.nombre}`, {
              action: { label: "Ver equipo", onClick: () => navigate(`/equipos/${equipo.id}`) },
            });
          } else {
            toast("Invitación rechazada", { description: equipo.nombre });
          }
        },
      },
    );
  }

  return (
    <article className="relative overflow-hidden rounded-[22px] border border-linea bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div
        className="h-2"
        style={{ background: `linear-gradient(90deg, ${equipo.color}, color-mix(in srgb, ${equipo.color} 25%, #fff))` }}
      />
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-bold text-white"
          style={{ background: equipo.color }}
        >
          {equipo.nombre.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-marino">{equipo.nombre}</h2>
            <Pildora color={equipo.color}>{ROLES[invitacion.rol]}</Pildora>
          </div>
          {equipo.descripcion && <p className="line-clamp-2 text-sm text-tenue">{equipo.descripcion}</p>}
          <p className="flex flex-wrap items-center gap-2 text-xs text-tenue">
            {invitacion.invitado_por && (
              <>
                <Avatar persona={invitacion.invitado_por} tamano="xs" />
                <span>
                  <span className="font-semibold text-texto">{invitacion.invitado_por.nombre}</span> te invitó{" "}
                  {haceCuanto(invitacion.creada_en)}
                </span>
                <span className="text-tenue/40">·</span>
              </>
            )}
            <span className="inline-flex items-center gap-1">
              <UsersRound className="size-3.5" />
              {equipo.num_miembros} {equipo.num_miembros === 1 ? "miembro" : "miembros"}
            </span>
          </p>
          {invitacion.mensaje && (
            <p className="flex gap-2 rounded-xl bg-fondo px-3.5 py-2.5 text-sm text-texto italic">
              <Mail className="mt-0.5 size-4 shrink-0 text-morado not-italic" />«{invitacion.mensaje}»
            </p>
          )}
        </div>
        <div className="flex gap-2 sm:flex-col">
          <Boton
            onClick={() => contestar(true)}
            cargando={pendiente === true}
            disabled={responder.isPending}
            style={{ background: equipo.color }}
            className="flex-1 sm:w-32 sm:flex-none"
          >
            <Check />
            Aceptar
          </Boton>
          <Boton variante="secundario" onClick={() => contestar(false)} cargando={pendiente === false} disabled={responder.isPending} className="flex-1 sm:w-32 sm:flex-none">
            <X />
            Rechazar
          </Boton>
        </div>
      </div>
    </article>
  );
}
