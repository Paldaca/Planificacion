import { CalendarRange, ClipboardList, LayoutGrid, Mail, Menu as MenuIcono, UsersRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useMisInvitaciones } from "@/api/queries";
import { nombreVisible, useIdentidad } from "@/auth/identidad";
import { Avatar } from "@/components/ui/Avatar";
import { isEmbedded } from "@/embed/protocol";
import { cn } from "@/lib/cn";

const NAVEGACION = [
  { a: "/mis-tareas", etiqueta: "Mis tareas", icono: ClipboardList },
  { a: "/tableros", etiqueta: "Tableros", icono: LayoutGrid },
  { a: "/equipos", etiqueta: "Equipos", icono: UsersRound },
  { a: "/invitaciones", etiqueta: "Invitaciones", icono: Mail, contador: true },
] as const;

/**
 * Marco de la app.
 *
 * Embebida en el Portal (`cpaldaca.com/planificacion`), el shell ya muestra su
 * propio menú lateral con los ítems de este módulo (navigationConfig.ts del
 * Portal), así que aquí no se repite: el contenido ocupa todo el iframe.
 * Abierta suelta (su subdominio), se pinta un menú con el mismo lenguaje
 * visual que el del Portal.
 */
export function Shell({ children }: { children: ReactNode }) {
  const embebido = isEmbedded();

  useEffect(() => {
    document.documentElement.dataset.embebido = String(embebido);
  }, [embebido]);

  if (embebido) {
    return <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">{children}</main>;
  }
  return <ShellSuelto>{children}</ShellSuelto>;
}

function ShellSuelto({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setAbierto(false), [pathname]);

  return (
    <div className="min-h-screen lg:pl-[264px]">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-linea/70 bg-white/85 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-lg p-2 text-marino transition-colors hover:bg-morado/8"
          aria-label="Abrir menú"
        >
          <MenuIcono className="size-5" />
        </button>
        <Marca compacta />
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] lg:block">
        <Barra />
      </aside>

      <AnimatePresence>
        {abierto && (
          <>
            <motion.button
              type="button"
              aria-label="Cerrar menú"
              className="fixed inset-0 z-40 bg-marino/50 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAbierto(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[264px] lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <Barra onCerrar={() => setAbierto(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}

function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-gradient-to-br from-rojo to-morado text-white shadow-[0_6px_16px_-6px_rgba(237,37,70,0.6)]",
          compacta ? "size-8" : "size-10",
        )}
      >
        <CalendarRange className={compacta ? "size-4" : "size-5"} />
      </span>
      <span className="leading-tight">
        <span className={cn("block font-display font-semibold", compacta ? "text-marino" : "text-white")}>
          Planificación
        </span>
        {!compacta && <span className="block text-[0.7rem] tracking-[0.2em] text-white/55">PALDACA</span>}
      </span>
    </div>
  );
}

function Barra({ onCerrar }: { onCerrar?: () => void }) {
  const identidad = useIdentidad();
  const { data: invitaciones } = useMisInvitaciones();
  const pendientes = invitaciones?.length ?? 0;

  return (
    <nav
      className="flex h-full flex-col font-display shadow-[4px_0_24px_rgba(8,10,32,0.35)]"
      style={{
        background:
          "linear-gradient(180deg, #141644 0%, color-mix(in srgb, #32407b 22%, #141644) 55%, #141644 100%)",
      }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
        <Marca />
        {onCerrar && (
          <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAVEGACION.map(({ a, etiqueta, icono: Icono, ...resto }) => (
          <NavLink
            key={a}
            to={a}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 rounded-[11px] px-3.5 py-2.5 text-[0.94rem] font-medium transition-all duration-200",
                isActive
                  ? "text-white shadow-[inset_4px_0_0_#ed2546,0_6px_18px_rgba(237,37,70,0.18)]"
                  : "text-white/85 hover:translate-x-0.5 hover:bg-white/9 hover:text-white",
              )
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background:
                      "linear-gradient(95deg, color-mix(in srgb, #ed2546 42%, #32407b 58%) 0%, rgba(50,64,123,0.35) 72%, rgba(20,22,68,0.2) 100%)",
                  }
                : undefined
            }
          >
            <Icono className="size-[21px] shrink-0 opacity-90" />
            <span className="flex-1">{etiqueta}</span>
            {"contador" in resto && pendientes > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="rounded-full bg-rojo px-2 py-0.5 text-[0.7rem] font-bold text-white"
              >
                {pendientes}
              </motion.span>
            )}
          </NavLink>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
        <Avatar
          persona={{
            id: identidad.id,
            nombre: nombreVisible(identidad),
            username: identidad.username,
            email: identidad.email,
            iniciales: iniciales(identidad.first_name, identidad.last_name, identidad.username),
            disciplina: identidad.disciplina,
          }}
          tamano="md"
          conTooltip={false}
          className="ring-white/20"
        />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium text-white">{nombreVisible(identidad)}</p>
          <p className="truncate font-sans text-xs text-white/55">{identidad.disciplina ?? identidad.email}</p>
        </div>
      </div>
    </nav>
  );
}

function iniciales(nombre: string, apellido: string, usuario: string) {
  const letras = [nombre, apellido].filter(Boolean).map((p) => p[0]).join("");
  return (letras || usuario[0] || "?").toUpperCase().slice(0, 2);
}
