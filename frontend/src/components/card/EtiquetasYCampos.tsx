import { useState } from "react";

import type { CambiosCard } from "@/api/queries";
import type { CampoPersonalizado, CardDetalle, TableroDetalle } from "@/api/tipos";
import { cn } from "@/lib/cn";

const estiloEntrada =
  "w-full rounded-lg border border-linea bg-white px-2.5 py-1.5 text-sm text-texto outline-none transition-colors focus:border-morado/50 disabled:bg-fondo disabled:text-tenue";

/** Etiquetas de la tarjeta (fase 5): se marcan y desmarcan con un clic. */
export function EtiquetasTarjeta({
  card,
  tablero,
  puede,
  onGuardar,
}: {
  card: CardDetalle;
  tablero: TableroDetalle;
  puede: boolean;
  onGuardar: (cambios: CambiosCard) => void;
}) {
  if (!tablero.etiquetas.length) {
    return (
      <p className="text-xs text-tenue">
        Este tablero no tiene etiquetas.
        {tablero.permisos.gestionar && " Créalas en «Etiquetas y campos» del menú del tablero."}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tablero.etiquetas.map((e) => {
        const activa = card.etiquetas.includes(e.id);
        return (
          <button
            key={e.id}
            type="button"
            disabled={!puede}
            aria-pressed={activa}
            onClick={() =>
              onGuardar({
                etiquetas: activa ? card.etiquetas.filter((id) => id !== e.id) : [...card.etiquetas, e.id],
              })
            }
            className={cn(
              "rounded-lg border px-2 py-1 text-xs font-semibold transition-all duration-200 active:scale-95 pointer-coarse:px-3 pointer-coarse:py-2",
              activa ? "border-transparent text-white shadow-sm" : "border-linea bg-white hover:border-current",
              !puede && "cursor-default active:scale-100",
            )}
            style={activa ? { background: e.color } : { color: e.color }}
          >
            {e.nombre}
          </button>
        );
      })}
    </div>
  );
}

/** Campos personalizados activos del tablero, editables en la tarjeta. */
export function CamposTarjeta({
  card,
  campos,
  puede,
  onGuardar,
}: {
  card: CardDetalle;
  campos: CampoPersonalizado[];
  puede: boolean;
  onGuardar: (cambios: CambiosCard) => void;
}) {
  return (
    <div className="space-y-2.5">
      {campos.map((campo) => (
        <label key={campo.id} className="block space-y-1">
          <span className="text-xs font-medium text-tenue">{campo.nombre}</span>
          <ValorCampo
            // Remonta al cambiar el valor desde fuera (otra persona, 409).
            key={String(card.campos[String(campo.id)] ?? "")}
            campo={campo}
            valor={card.campos[String(campo.id)]}
            puede={puede}
            onGuardar={(valor) => onGuardar({ campos: { [String(campo.id)]: valor } })}
          />
        </label>
      ))}
    </div>
  );
}

function ValorCampo({
  campo,
  valor,
  puede,
  onGuardar,
}: {
  campo: CampoPersonalizado;
  valor: string | number | undefined;
  puede: boolean;
  onGuardar: (valor: string | number | null) => void;
}) {
  const [texto, setTexto] = useState(valor === undefined ? "" : String(valor));

  if (campo.tipo === "lista") {
    return (
      <select
        disabled={!puede}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          onGuardar(e.target.value || null);
        }}
        className={estiloEntrada}
      >
        <option value="">—</option>
        {campo.opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {/* Opción que ya no existe en la lista: se muestra para no perderla. */}
        {texto && !campo.opciones.includes(texto) && <option value={texto}>{texto}</option>}
      </select>
    );
  }

  function guardar() {
    const limpio = texto.trim();
    if (limpio === (valor === undefined ? "" : String(valor))) return;
    onGuardar(limpio === "" ? null : limpio);
  }

  return (
    <input
      disabled={!puede}
      value={texto}
      inputMode={campo.tipo === "numero" ? "decimal" : undefined}
      maxLength={campo.tipo === "texto" ? 500 : 30}
      placeholder={campo.tipo === "numero" ? "0" : "—"}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(estiloEntrada, campo.tipo === "numero" && "tabular-nums")}
    />
  );
}
