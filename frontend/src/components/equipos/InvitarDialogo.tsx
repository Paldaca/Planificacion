import { Check, Info, Search, Send, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useInvitar, usePersonas } from "@/api/queries";
import type { Equipo, Persona, PersonaBuscada, RolEquipo } from "@/api/tipos";
import { Avatar } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { Esqueleto } from "@/components/ui/Estados";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";

const OPCIONES_ROL: { rol: RolEquipo; titulo: string; texto: string }[] = [
  { rol: "miembro", titulo: "Miembro", texto: "Crea, mueve y comenta tarjetas." },
  { rol: "lector", titulo: "Lector", texto: "Solo consulta los tableros." },
  { rol: "administrador", titulo: "Administrador", texto: "Además gestiona miembros, columnas y tableros." },
];

/** Para pintar el avatar: el color sale del id local o, si aún no existe, del Portal. */
function comoPersona(p: PersonaBuscada): Persona {
  return { ...p, id: p.id ?? p.portal_id ?? 0 };
}

function useRetardado<T>(valor: T, ms = 250): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setV(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/** Invitar: la persona recibe un aviso en la campana del Portal y decide. */
export function InvitarDialogo({ equipo, abierto, onCerrar }: { equipo: Equipo; abierto: boolean; onCerrar: () => void }) {
  const [q, setQ] = useState("");
  const [elegida, setElegida] = useState<PersonaBuscada | null>(null);
  const [rol, setRol] = useState<RolEquipo>("miembro");
  const [mensaje, setMensaje] = useState("");
  const busqueda = useRetardado(q);
  const { data, isFetching } = usePersonas(busqueda, equipo.id);
  const personas = data?.resultados;
  const invitar = useInvitar(equipo.id);

  useAlAbrir(abierto, () => {
    setQ("");
    setElegida(null);
    setRol("miembro");
    setMensaje("");
  });

  async function enviar() {
    if (!elegida) return;
    const referencia = elegida.portal_id !== undefined ? { portal_id: elegida.portal_id } : { usuario: elegida.id ?? undefined };
    await invitar.mutateAsync({ ...referencia, rol, mensaje });
    toast.success(`Invitación enviada a ${elegida.nombre}`, {
      description: "Le llegará un aviso en la campana del Portal.",
    });
    onCerrar();
  }

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo={`Invitar a ${equipo.nombre}`}
      descripcion="La persona debe aceptar la invitación para unirse."
      icono={UserPlus}
      color={equipo.color}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={() => void enviar()} disabled={!elegida} cargando={invitar.isPending}>
            <Send />
            Enviar invitación
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Campo etiqueta="Persona">
          <AnimatePresence mode="wait" initial={false}>
            {elegida ? (
              <motion.div
                key="elegida"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 rounded-2xl border border-morado/30 bg-morado/5 px-3.5 py-2.5"
              >
                <Avatar persona={comoPersona(elegida)} tamano="md" conTooltip={false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-texto">{elegida.nombre}</p>
                  <p className="truncate text-xs text-tenue">{elegida.disciplina ?? elegida.email}</p>
                </div>
                <Boton variante="fantasma" tamano="sm" onClick={() => setElegida(null)}>
                  Cambiar
                </Boton>
              </motion.div>
            ) : (
              <motion.div key="buscar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tenue/70" />
                  <Entrada
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Nombre, apellido, usuario, correo o cédula"
                    className="pl-10"
                  />
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto">
                  {data?.fuente === "local" && busqueda.trim().length >= 3 && (
                    <p className="mb-2 flex gap-2 rounded-xl bg-[#fffbeb] px-3 py-2 text-xs text-[#b45309]">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      El Portal no respondió: por ahora solo aparecen quienes ya entraron a Planificación.
                    </p>
                  )}
                  {busqueda.trim().length < 3 ? (
                    <p className="px-1 py-2 text-xs text-tenue">
                      Escribe al menos 3 caracteres. Aparecen las personas del Portal con acceso a Planificación.
                    </p>
                  ) : isFetching && !personas ? (
                    <div className="space-y-1.5">
                      <Esqueleto className="h-12" />
                      <Esqueleto className="h-12" />
                    </div>
                  ) : personas && personas.length ? (
                    <ul className="space-y-1">
                      {personas.map((p, i) => (
                        <motion.li key={p.portal_id ?? p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                          <button
                            type="button"
                            onClick={() => setElegida(p)}
                            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-morado/8"
                          >
                            <Avatar persona={comoPersona(p)} tamano="sm" conTooltip={false} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-texto">{p.nombre}</span>
                              <span className="block truncate text-xs text-tenue">{p.disciplina ?? p.email}</span>
                            </span>
                          </button>
                        </motion.li>
                      ))}
                    </ul>
                  ) : (
                    <p className="flex gap-2 rounded-xl bg-fondo px-3 py-3 text-xs leading-relaxed text-tenue">
                      <Info className="mt-0.5 size-4 shrink-0 text-morado" />
                      Nadie coincide. Solo aparecen personas con acceso a Planificación en el Portal que no
                      están ya en el equipo ni invitadas. Si falta alguien, pide a un administrador del Portal
                      que le habilite el módulo.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Campo>

        <Campo etiqueta="Rol en el equipo">
          <div className="grid gap-2 sm:grid-cols-3">
            {OPCIONES_ROL.map((o) => {
              const activo = rol === o.rol;
              return (
                <button
                  key={o.rol}
                  type="button"
                  onClick={() => setRol(o.rol)}
                  className={cn(
                    "relative rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                    activo ? "border-morado bg-morado/5 shadow-[0_0_0_3px_rgba(50,64,123,0.1)]" : "border-linea hover:border-morado/30",
                  )}
                >
                  {activo && <Check className="check-burst absolute top-2.5 right-2.5 size-3.5 text-morado" />}
                  <span className="block text-sm font-semibold text-texto">{o.titulo}</span>
                  <span className="mt-0.5 block text-[0.72rem] leading-snug text-tenue">{o.texto}</span>
                </button>
              );
            })}
          </div>
        </Campo>

        <Campo etiqueta="Mensaje" ayuda="Opcional. Se incluye en el aviso.">
          <Entrada value={mensaje} maxLength={300} placeholder="Ej. Para el proyecto de la planta norte" onChange={(e) => setMensaje(e.target.value)} />
        </Campo>
      </div>
    </Dialogo>
  );
}
