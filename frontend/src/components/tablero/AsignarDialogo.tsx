import { UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { type GrupoAsignacion, useAsignarEnLote } from "@/api/configuracion";
import type { TableroDetalle } from "@/api/tipos";
import { BotonAyuda, SeccionAyuda } from "@/components/ayuda/BotonAyuda";
import { Boton } from "@/components/ui/Boton";
import { Dialogo } from "@/components/ui/Dialogo";

/**
 * «Asignar por etiqueta o fase»: todas las tarjetas abiertas de una etiqueta
 * o de una opción de un campo de lista (una fase) a una persona, de una vez.
 * Tiene su propia entrada en el menú «…» del tablero. Solo quien gestiona.
 */
export function AsignarDialogo({
  tablero,
  abierto,
  onCerrar,
}: {
  tablero: TableroDetalle;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Asignar por etiqueta o fase"
      descripcion="Una persona queda como responsable de todas las tarjetas abiertas de un grupo."
      icono={UserCheck}
      ancho="md"
    >
      <div className="mb-3 flex justify-end">
        <AyudaAsignar />
      </div>
      {/* Se monta al abrir: cada vez empieza vacío. */}
      {abierto && <Asignar tablero={tablero} />}
    </Dialogo>
  );
}

function AyudaAsignar() {
  return (
    <BotonAyuda etiqueta="¿Cómo funciona «Asignar»?" titulo="Asignar por etiqueta o por fase" align="end">
      <p>
        Un atajo para repartir el trabajo: eliges una etiqueta (o una opción de un campo de lista, como una <b>Fase</b>) y una persona, y
        queda como responsable de <b>todas las tarjetas abiertas</b> que la llevan.
      </p>
      <SeccionAyuda titulo="Qué hace y qué no">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>Se suma a los responsables que ya había; marca «Solo esta persona» para reemplazarlos.</li>
          <li>Las tarjetas terminadas o archivadas no se tocan.</li>
          <li>Es de una vez: las tarjetas que se creen después no se asignan solas.</li>
          <li>Cada cambio queda en el historial de su tarjeta y la persona recibe un solo aviso.</li>
        </ul>
      </SeccionAyuda>
    </BotonAyuda>
  );
}

const estiloSelect =
  "h-10 w-full rounded-xl border border-linea bg-white px-3 text-sm text-texto outline-none focus:border-morado/50";

/** «e:<id>» (etiqueta) o «c:<id del campo>:<índice de la opción>». */
function grupoDe(clave: string, tablero: TableroDetalle): GrupoAsignacion | null {
  const [tipo, id, indice] = clave.split(":");
  if (tipo === "e") return { etiqueta: Number(id) };
  const campo = tablero.campos.find((c) => c.id === Number(id));
  const opcion = campo?.opciones[Number(indice)];
  return campo && opcion !== undefined ? { campo: campo.id, opcion } : null;
}

function Asignar({ tablero }: { tablero: TableroDetalle }) {
  const asignar = useAsignarEnLote(tablero.id);
  const [clave, setClave] = useState("");
  const [persona, setPersona] = useState<number | null>(null);
  const [reemplazar, setReemplazar] = useState(false);
  const listas = tablero.campos.filter((c) => !c.archivado && c.tipo === "lista" && c.opciones.length > 0);
  const grupo = useMemo(() => (clave ? grupoDe(clave, tablero) : null), [clave, tablero]);

  // Lo mismo que hará el servidor, para decir cuántas cambian antes de pedirlo.
  const { abiertas, yaLaTienen } = useMemo(() => {
    if (!grupo) return { abiertas: 0, yaLaTienen: 0 };
    const cumplen = tablero.cards.filter(
      (c) =>
        !c.completada_en &&
        ("etiqueta" in grupo ? c.etiquetas.includes(grupo.etiqueta) : c.campos[String(grupo.campo)] === grupo.opcion),
    );
    const ya = cumplen.filter((c) =>
      reemplazar
        ? c.responsables.length === 1 && c.responsables[0].id === persona
        : c.responsables.some((r) => r.id === persona),
    ).length;
    return { abiertas: cumplen.length, yaLaTienen: ya };
  }, [grupo, tablero.cards, persona, reemplazar]);
  const cambian = abiertas - yaLaTienen;

  function confirmar() {
    if (!grupo || persona === null) return;
    asignar.mutate(
      { ...grupo, usuario: persona, reemplazar },
      {
        onSuccess: (r) => {
          const nombre = tablero.personas.find((p) => p.id === persona)?.nombre ?? "La persona";
          toast.success(
            r.cambiadas
              ? `${nombre} quedó en ${r.cambiadas} tarjeta${r.cambiadas === 1 ? "" : "s"}`
              : "No había nada que cambiar",
          );
        },
      },
    );
  }

  if (!tablero.etiquetas.length && !listas.length) {
    return (
      <p className="rounded-xl bg-fondo p-4 text-sm text-tenue">
        Crea primero una etiqueta o un campo de lista (por ejemplo «Fase»): este atajo asigna todas sus tarjetas a una persona.
      </p>
    );
  }
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-tenue">
          Tarjetas de…
          <select value={clave} onChange={(e) => setClave(e.target.value)} className={estiloSelect}>
            <option value="">Etiqueta o fase</option>
            {tablero.etiquetas.length > 0 && (
              <optgroup label="Etiquetas">
                {tablero.etiquetas.map((e) => (
                  <option key={e.id} value={`e:${e.id}`}>
                    {e.nombre}
                  </option>
                ))}
              </optgroup>
            )}
            {listas.map((c) => (
              <optgroup key={c.id} label={c.nombre}>
                {c.opciones.map((o, i) => (
                  <option key={o} value={`c:${c.id}:${i}`}>
                    {o}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-tenue">
          Asignar a
          <select
            value={persona ?? ""}
            onChange={(e) => setPersona(e.target.value ? Number(e.target.value) : null)}
            className={estiloSelect}
          >
            <option value="">Elige una persona</option>
            {tablero.personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-texto pointer-coarse:py-1">
        <input
          type="checkbox"
          checked={reemplazar}
          onChange={(e) => setReemplazar(e.target.checked)}
          className="size-4 accent-morado"
        />
        Solo esta persona (quita a los demás responsables)
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-tenue">
          {grupo
            ? `${abiertas} tarjeta${abiertas === 1 ? "" : "s"} abierta${abiertas === 1 ? "" : "s"}` +
              (persona !== null && yaLaTienen ? ` · ${yaLaTienen} ya quedan así` : "") +
              " · las terminadas no se tocan"
            : "Las tarjetas terminadas o archivadas no se tocan."}
        </p>
        <Boton onClick={confirmar} cargando={asignar.isPending} disabled={!grupo || persona === null || cambian === 0}>
          <UserCheck />
          Asignar {grupo && persona !== null ? `${cambian} tarjeta${cambian === 1 ? "" : "s"}` : ""}
        </Boton>
      </div>
    </div>
  );
}
