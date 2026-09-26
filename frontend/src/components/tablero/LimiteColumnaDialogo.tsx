import { Gauge } from "lucide-react";
import { useState } from "react";

import { useEditarColumna } from "@/api/queries";
import type { Columna } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { Campo, Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { useAlAbrir } from "@/hooks/useAlAbrir";

/**
 * Límite de trabajo en curso de una columna (fase 5). Es **suave** (D-13):
 * al pasarse, la columna se marca en rojo y se avisa, pero no se bloquea.
 */
export function LimiteColumnaDialogo({
  tableroId,
  columna,
  total,
  onCerrar,
}: {
  tableroId: number;
  columna: Columna | null;
  total: number;
  onCerrar: () => void;
}) {
  const editar = useEditarColumna(tableroId);
  const [valor, setValor] = useState("");
  // La columna abierta se recuerda para que el diálogo no se vacíe mientras se cierra.
  const [abierta, setAbierta] = useState<{ columna: Columna; total: number } | null>(null);

  useAlAbrir(columna !== null, () => {
    if (columna) setAbierta({ columna, total });
    setValor(columna?.limite_cards ? String(columna.limite_cards) : "");
  });

  const numero = Number(valor);
  const valido = valor === "" || (Number.isInteger(numero) && numero >= 1 && numero <= 999);

  function guardar(limite: number | null) {
    if (!abierta) return;
    editar.mutate({ id: abierta.columna.id, cambios: { limite_cards: limite } }, { onSuccess: onCerrar });
  }

  return (
    <Dialogo
      abierto={columna !== null}
      onCambio={(v) => !v && onCerrar()}
      titulo={`Límite de «${abierta?.columna.nombre ?? ""}»`}
      descripcion="Cuántas tarjetas conviene tener a la vez en esta columna. Al pasarse se marca en rojo y se avisa; no bloquea."
      icono={Gauge}
      ancho="sm"
      pie={
        <>
          {abierta?.columna.limite_cards ? (
            <Boton variante="secundario" onClick={() => guardar(null)} cargando={editar.isPending}>
              Quitar límite
            </Boton>
          ) : (
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
          )}
          <Boton disabled={!valido || valor === ""} cargando={editar.isPending} onClick={() => guardar(numero)}>
            Guardar
          </Boton>
        </>
      }
    >
      <Campo etiqueta="Máximo de tarjetas" ayuda={`Hoy tiene ${columna ? total : (abierta?.total ?? 0)}.`}>
        <Entrada
          type="number"
          min={1}
          max={999}
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valido && valor !== "" && guardar(numero)}
        />
      </Campo>
    </Dialogo>
  );
}
