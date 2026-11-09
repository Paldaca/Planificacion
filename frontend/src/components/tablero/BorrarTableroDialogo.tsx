import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useBorrarTablero } from "@/api/queries";
import type { TableroResumen } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";

/**
 * Confirmar el borrado de un tablero archivado. No se puede deshacer, así que
 * pide escribir su nombre (como se hace con lo que no tiene papelera).
 */
export function BorrarTableroDialogo({
  tablero,
  abierto,
  onCerrar,
  onBorrado,
}: {
  tablero: Pick<TableroResumen, "id" | "nombre" | "equipo">;
  abierto: boolean;
  onCerrar: () => void;
  /** Después de borrarlo (p. ej. salir de su página). */
  onBorrado?: () => void;
}) {
  const borrar = useBorrarTablero();
  const [escrito, setEscrito] = useState("");
  // Se limpia al cerrar: la próxima vez vuelve a pedir el nombre.
  const cerrar = () => {
    setEscrito("");
    onCerrar();
  };
  const coincide = escrito.trim() === tablero.nombre.trim();

  const confirmar = () => {
    if (!coincide) return;
    borrar.mutate(tablero, {
      onSuccess: () => {
        toast("Tablero borrado", { description: tablero.nombre });
        cerrar();
        onBorrado?.();
      },
    });
  };

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && cerrar()}
      titulo="¿Borrar este tablero para siempre?"
      descripcion="Se borran sus columnas y todas sus tarjetas, también las archivadas, con su checklist, comentarios, adjuntos e historial. No se puede deshacer."
      icono={Trash2}
      color="#dc2626"
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton
            className="bg-[#dc2626] hover:bg-[#b91c1c]"
            disabled={!coincide}
            cargando={borrar.isPending}
            onClick={confirmar}
          >
            <Trash2 />
            Borrar tablero
          </Boton>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
      >
        <p className="text-sm text-tenue">
          Si solo quieres sacarlo de la vista, déjalo archivado. Las plantillas que guardaste desde él no se borran.
        </p>
        {/* La instrucción va fuera de la etiqueta de `Campo` (que va en mayúsculas):
            el nombre tiene que verse tal como hay que escribirlo. */}
        <p className="text-sm text-texto">
          Para confirmar, escribe el nombre del tablero: <strong className="font-semibold [overflow-wrap:anywhere]">{tablero.nombre}</strong>
        </p>
        <Entrada
          value={escrito}
          onChange={(e) => setEscrito(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label="Nombre del tablero"
          placeholder={tablero.nombre}
        />
      </form>
    </Dialogo>
  );
}
