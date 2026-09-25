import type { ReactNode } from "react";

/** Cabecera de página con la tipografía y la entrada del Home del Portal. */
export function Encabezado({
  antetitulo,
  titulo,
  subtitulo,
  acciones,
}: {
  antetitulo?: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-7 flex animate-rise flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {antetitulo && (
          <p className="mb-1.5 text-[0.74rem] font-semibold tracking-[0.1em] text-tenue uppercase">{antetitulo}</p>
        )}
        <h1 className="font-display text-[clamp(1.45rem,2.6vw,1.8rem)] leading-tight font-semibold tracking-tight text-marino">
          {titulo}
        </h1>
        {subtitulo && <div className="mt-1.5 text-sm text-tenue">{subtitulo}</div>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}
