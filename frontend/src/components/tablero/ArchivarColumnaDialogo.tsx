import { Archive } from "lucide-react";
import { useState } from "react";

import { useArchivarColumna } from "@/api/queries";
import type { Columna, TableroDetalle } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { Dialogo } from "@/components/ui/Dialogo";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";

/** Archivar una columna con tarjetas exige elegir a dónde van (nada se pierde). */
export function ArchivarColumnaDialogo({
  tablero,
  columna,
  onCerrar,
}: {
  tablero: TableroDetalle;
  columna: Columna | null;
  onCerrar: () => void;
}) {
  const archivar = useArchivarColumna(tablero.id);
  const otras = tablero.columnas.filter((c) => c.id !== columna?.id);
  const cantidad = columna ? tablero.cards.filter((c) => c.columna === columna.id).length : 0;
  const [destino, setDestino] = useState<number | undefined>(otras[0]?.id);

  useAlAbrir(columna !== null, () => setDestino(otras[0]?.id));

  async function confirmar() {
    if (!columna) return;
    await archivar.mutateAsync({ id: columna.id, moverA: cantidad ? destino : undefined });
    onCerrar();
  }

  return (
    <Dialogo
      abierto={columna !== null}
      onCambio={(v) => !v && onCerrar()}
      titulo={`Archivar «${columna?.nombre ?? ""}»`}
      descripcion={
        otras.length === 0
          ? "El tablero necesita al menos una columna."
          : cantidad
            ? `Tiene ${cantidad} ${cantidad === 1 ? "tarjeta" : "tarjetas"}. Elige a qué columna moverlas.`
            : "La columna está vacía; puedes archivarla sin mover nada."
      }
      icono={Archive}
      color="#dc2626"
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            className="bg-[#dc2626] hover:bg-[#b91c1c]"
            onClick={() => void confirmar()}
            cargando={archivar.isPending}
            disabled={otras.length === 0}
          >
            Archivar columna
          </Boton>
        </>
      }
    >
      {cantidad > 0 && otras.length > 0 ? (
        <div className="grid gap-2">
          {otras.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setDestino(c.id)}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-200",
                destino === c.id
                  ? "border-morado bg-morado/6 text-morado shadow-[0_0_0_3px_rgba(50,64,123,0.1)]"
                  : "border-linea text-texto hover:border-morado/30",
              )}
            >
              {c.nombre}
              {c.es_final && <span className="text-xs text-[#059669]">Columna final</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-tenue">Podrás verla de nuevo desde el administrador si hiciera falta.</p>
      )}
    </Dialogo>
  );
}
