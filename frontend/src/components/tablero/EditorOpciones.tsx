import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, type ClipboardEvent } from "react";
import { toast } from "sonner";

import { Boton } from "@/components/ui/Boton";
import { Entrada } from "@/components/ui/Campos";
import { cn } from "@/lib/cn";
import { MAX_LARGO_OPCION, MAX_OPCIONES, opcionesDeTexto } from "@/lib/opciones";

const BOTON_FILA =
  "rounded-lg p-1.5 text-tenue transition-colors hover:bg-morado/8 hover:text-morado disabled:pointer-events-none disabled:opacity-30 pointer-coarse:p-2";

/**
 * Opciones de un campo de tipo lista, una por fila: se renombran en su sitio,
 * se ordenan con las flechas (el orden es el de los desplegables y el de los
 * grupos del Gantt) y se añaden de una en una o pegando varias.
 *
 * `onCambio(opciones, renombrar)`: `renombrar` ({vieja: nueva}) viene cuando
 * se cambió el nombre de una, para que el servidor lo cambie también en las
 * tarjetas que la tenían.
 */
export function EditorOpciones({
  opciones,
  usos,
  borrador,
  onBorrador,
  onCambio,
}: {
  opciones: string[];
  /** Cuántas tarjetas tienen cada opción (al editar un campo que ya existe). */
  usos?: Map<string, number>;
  /** Lo escrito en «Añadir opción» y aún sin añadir. */
  borrador: string;
  onBorrador: (texto: string) => void;
  onCambio: (opciones: string[], renombrar?: Record<string, string>) => void;
}) {
  const llena = opciones.length >= MAX_OPCIONES;

  function agregar(texto: string) {
    const leidas = opcionesDeTexto(texto);
    if (!leidas.length) return;
    const nuevas = leidas.filter((o) => !opciones.includes(o));
    if (!nuevas.length) {
      toast.error(leidas.length === 1 ? `Ya hay una opción «${leidas[0]}».` : "Esas opciones ya están en la lista.");
      return;
    }
    const caben = nuevas.slice(0, MAX_OPCIONES - opciones.length);
    if (caben.length < nuevas.length) toast(`Una lista admite hasta ${MAX_OPCIONES} opciones: se añadieron ${caben.length}.`);
    onBorrador("");
    if (caben.length) onCambio([...opciones, ...caben]);
  }

  function alPegar(e: ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData("text");
    // Varias líneas (una columna de Excel, una lista): entran todas de una vez.
    if (!/[\n\r\t]/.test(texto.trim())) return;
    e.preventDefault();
    agregar(`${borrador}\n${texto}`);
  }

  function renombrar(indice: number, texto: string): boolean {
    const nueva = texto.trim().slice(0, MAX_LARGO_OPCION);
    const vieja = opciones[indice];
    if (!nueva || nueva === vieja) return false;
    if (opciones.includes(nueva)) {
      toast.error(`Ya hay una opción «${nueva}».`);
      return false;
    }
    onCambio(
      opciones.map((o, i) => (i === indice ? nueva : o)),
      { [vieja]: nueva },
    );
    return true;
  }

  function mover(indice: number, salto: -1 | 1) {
    const copia = [...opciones];
    [copia[indice], copia[indice + salto]] = [copia[indice + salto], copia[indice]];
    onCambio(copia);
  }

  return (
    <div className="space-y-2">
      {opciones.length > 0 && (
        <ol className="divide-y divide-linea/70 rounded-xl border border-linea bg-white">
          {opciones.map((opcion, i) => (
            <FilaOpcion
              key={opcion}
              opcion={opcion}
              numero={i + 1}
              usos={usos?.get(opcion) ?? 0}
              primera={i === 0}
              ultima={i === opciones.length - 1}
              unica={opciones.length === 1}
              onRenombrar={(texto) => renombrar(i, texto)}
              onMover={(salto) => mover(i, salto)}
              onQuitar={() => onCambio(opciones.filter((_, j) => j !== i))}
            />
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <Entrada
          value={borrador}
          disabled={llena}
          aria-label="Añadir opción"
          placeholder={llena ? `Ya tiene ${MAX_OPCIONES} opciones` : opciones.length ? "Añadir otra opción" : "Primera opción: escríbela y pulsa Enter"}
          onChange={(e) => onBorrador(e.target.value)}
          onPaste={alPegar}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            agregar(borrador);
          }}
          className="h-9"
        />
        <Boton variante="secundario" tamano="sm" disabled={llena || !borrador.trim()} onClick={() => agregar(borrador)}>
          <Plus />
          Añadir
        </Boton>
      </div>
      <p className="text-xs text-tenue">
        Enter añade la opción y deja el cursor listo para la siguiente. También puedes pegar varias de una vez: una por línea (una columna
        de Excel) o separadas por comas.
      </p>
    </div>
  );
}

function FilaOpcion({
  opcion,
  numero,
  usos,
  primera,
  ultima,
  unica,
  onRenombrar,
  onMover,
  onQuitar,
}: {
  opcion: string;
  numero: number;
  usos: number;
  primera: boolean;
  ultima: boolean;
  unica: boolean;
  /** Devuelve false si el nombre no vale (vacío, igual o repetido): se repone el anterior. */
  onRenombrar: (texto: string) => boolean;
  onMover: (salto: -1 | 1) => void;
  onQuitar: () => void;
}) {
  const [texto, setTexto] = useState(opcion);
  const [confirmar, setConfirmar] = useState(false);

  return (
    <li className="flex items-center gap-1 py-1 pr-1.5 pl-3">
      <span className="w-5 shrink-0 text-xs text-tenue tabular-nums">{numero}</span>
      <input
        value={texto}
        maxLength={MAX_LARGO_OPCION}
        aria-label={`Opción ${numero}`}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (!onRenombrar(texto)) setTexto(opcion);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setTexto(opcion);
        }}
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-texto outline-none hover:border-linea focus:border-morado/40"
      />
      {usos > 0 && !confirmar && (
        <span className="shrink-0 text-xs text-tenue tabular-nums max-sm:hidden">{usos === 1 ? "1 tarjeta" : `${usos} tarjetas`}</span>
      )}
      <button type="button" disabled={primera} aria-label={`Subir «${opcion}»`} title="Subir" onClick={() => onMover(-1)} className={BOTON_FILA}>
        <ArrowUp className="size-4" />
      </button>
      <button type="button" disabled={ultima} aria-label={`Bajar «${opcion}»`} title="Bajar" onClick={() => onMover(1)} className={BOTON_FILA}>
        <ArrowDown className="size-4" />
      </button>
      {confirmar ? (
        <Boton variante="peligro" tamano="sm" onClick={onQuitar} onBlur={() => setConfirmar(false)} autoFocus>
          ¿Quitar? {usos === 1 ? "1 tarjeta la usa" : `${usos} tarjetas la usan`}
        </Boton>
      ) : (
        <button
          type="button"
          disabled={unica}
          aria-label={`Quitar «${opcion}»`}
          title={unica ? "Una lista necesita al menos una opción" : "Quitar"}
          // Si hay tarjetas con esta opción, se pregunta antes: conservan el valor, pero ya no se podrá elegir.
          onClick={() => (usos > 0 ? setConfirmar(true) : onQuitar())}
          className={cn(BOTON_FILA, "hover:bg-[#fef2f2] hover:text-[#dc2626]")}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}
