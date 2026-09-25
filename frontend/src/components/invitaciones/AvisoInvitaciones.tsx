import { ArrowRight, Mail } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";

import { useMisInvitaciones } from "@/api/queries";

/** Franja que aparece arriba de Mis tareas y Tableros si hay invitaciones. */
export function AvisoInvitaciones() {
  const { data } = useMisInvitaciones();
  const n = data?.length ?? 0;
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <Link
            to="/invitaciones"
            className="group flex items-center gap-4 rounded-[18px] border border-rojo/20 bg-gradient-to-r from-[#fff1f3] to-white px-5 py-4 transition-shadow hover:shadow-[0_12px_26px_-16px_rgba(237,37,70,0.6)]"
          >
            <span className="relative flex size-11 items-center justify-center rounded-2xl bg-rojo text-white">
              <Mail className="size-5" />
              <span className="absolute -top-1 -right-1 flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-rojo opacity-60" />
                <span className="relative inline-flex size-3 rounded-full border-2 border-white bg-rojo" />
              </span>
            </span>
            <div className="flex-1">
              <p className="font-display font-semibold text-marino">
                Tienes {n} {n === 1 ? "invitación pendiente" : "invitaciones pendientes"}
              </p>
              <p className="text-sm text-tenue">Acepta para ver los tableros del equipo.</p>
            </div>
            <ArrowRight className="size-5 text-rojo transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
