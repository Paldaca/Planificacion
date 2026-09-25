import { CalendarRange, LoaderCircle } from "lucide-react";

import { Boton } from "@/components/ui/Boton";

type Props = {
  titulo: string;
  mensaje: string;
  accion?: { etiqueta: string; onClick: () => void };
  cargando?: boolean;
};

/** Pantalla de estado no-feliz (sin sesión / sin acceso / Portal caído). */
export function StatusScreen({ titulo, mensaje, accion, cargando }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-fondo p-6">
      <div className="w-full max-w-md animate-rise rounded-[24px] border border-linea bg-white p-8 text-center shadow-[0_30px_60px_-30px_rgba(20,22,68,0.35)]">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rojo to-morado text-white shadow-[0_10px_24px_-10px_rgba(237,37,70,0.6)]">
          {cargando ? <LoaderCircle className="size-7 animate-spin" /> : <CalendarRange className="size-7" />}
        </span>
        <h1 className="font-display text-xl font-semibold text-marino">{titulo}</h1>
        <p className="mt-2 text-sm leading-relaxed text-tenue">{mensaje}</p>
        {accion && (
          <Boton className="mt-6" onClick={accion.onClick}>
            {accion.etiqueta}
          </Boton>
        )}
      </div>
    </div>
  );
}
