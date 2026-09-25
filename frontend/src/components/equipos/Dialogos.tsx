import { Check, LayoutGrid, Lock, UsersRound } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useCrearEquipo, useCrearTablero, useEditarEquipo } from "@/api/queries";
import type { Equipo } from "@/api/tipos";
import { Boton } from "@/components/ui/Boton";
import { AreaTexto, Campo, Entrada } from "@/components/ui/Campos";
import { Dialogo } from "@/components/ui/Dialogo";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { cn } from "@/lib/cn";
import { COLORES_EQUIPO } from "@/lib/estilos";

function SelectorColor({ valor, onCambio }: { valor: string; onCambio: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {COLORES_EQUIPO.map((color) => {
        const activo = valor === color;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onCambio(color)}
            className={cn(
              "flex size-9 items-center justify-center rounded-xl text-white transition-all duration-200 hover:scale-110",
              activo && "scale-110 ring-2 ring-offset-2",
            )}
            style={{ background: color, ...(activo ? { "--tw-ring-color": color } : {}) } as CSSProperties}
            aria-label={`Color ${color}`}
            aria-pressed={activo}
          >
            {activo && <Check className="check-burst size-4" />}
          </button>
        );
      })}
    </div>
  );
}

/** Crear o editar un equipo. Quien lo crea queda como administrador. */
export function EquipoDialogo({
  abierto,
  onCerrar,
  equipo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  equipo?: Equipo;
}) {
  const navigate = useNavigate();
  const crear = useCrearEquipo();
  const editar = useEditarEquipo(equipo?.id ?? -1);
  const [valores, setValores] = useState({ nombre: "", descripcion: "", color: COLORES_EQUIPO[0] });

  // Solo al abrir: un refetch en segundo plano no debe pisar lo que se escribe.
  useAlAbrir(abierto, () =>
    setValores(
      equipo
        ? { nombre: equipo.nombre, descripcion: equipo.descripcion, color: equipo.color }
        : { nombre: "", descripcion: "", color: COLORES_EQUIPO[0] },
    ),
  );

  async function guardar() {
    if (equipo) {
      await editar.mutateAsync(valores);
      onCerrar();
      return;
    }
    const nuevo = await crear.mutateAsync(valores);
    onCerrar();
    toast.success(`Equipo «${nuevo.nombre}» creado`, { description: "Ya puedes invitar a tus compañeros." });
    navigate(`/equipos/${nuevo.id}`);
  }

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo={equipo ? "Editar equipo" : "Nuevo equipo"}
      descripcion={equipo ? undefined : "Serás su administrador. Los demás entran por invitación."}
      icono={UsersRound}
      color={valores.color}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            onClick={() => void guardar()}
            cargando={crear.isPending || editar.isPending}
            disabled={!valores.nombre.trim()}
            style={{ background: valores.color }}
          >
            {equipo ? "Guardar" : "Crear equipo"}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Campo etiqueta="Nombre">
          <Entrada
            autoFocus
            value={valores.nombre}
            maxLength={100}
            placeholder="Ej. Ingeniería de procesos"
            onChange={(e) => setValores({ ...valores, nombre: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && valores.nombre.trim() && void guardar()}
          />
        </Campo>
        <Campo etiqueta="Descripción" ayuda="Opcional. Para qué existe este equipo.">
          <AreaTexto
            value={valores.descripcion}
            maxLength={2000}
            rows={3}
            onChange={(e) => setValores({ ...valores, descripcion: e.target.value })}
          />
        </Campo>
        <Campo etiqueta="Color">
          <SelectorColor valor={valores.color} onCambio={(color) => setValores({ ...valores, color })} />
        </Campo>
      </div>
    </Dialogo>
  );
}

/**
 * Nuevo tablero (con columnas Tareas / En curso / Hecho). El equipo es
 * opcional: sin equipo, el tablero es personal y solo lo ve quien lo crea.
 * Solo se ofrecen los equipos que la persona administra.
 */
export function TableroDialogo({
  abierto,
  onCerrar,
  equipos,
  equipoInicial = null,
}: {
  abierto: boolean;
  onCerrar: () => void;
  equipos: Equipo[];
  /** Equipo preseleccionado (desde la sección de un equipo); `null` = personal. */
  equipoInicial?: number | null;
}) {
  const navigate = useNavigate();
  const crear = useCrearTablero();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [equipo, setEquipo] = useState<number | null>(equipoInicial);

  useAlAbrir(abierto, () => {
    setNombre("");
    setDescripcion("");
    setEquipo(equipoInicial);
  });

  const elegido = equipos.find((e) => e.id === equipo);

  async function guardar() {
    const t = await crear.mutateAsync({ nombre: nombre.trim(), descripcion, equipo });
    onCerrar();
    navigate(`/tableros/${t.id}`);
  }

  const opcion = (activa: boolean) =>
    cn(
      "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200",
      activa ? "text-white shadow-sm" : "border-linea text-texto hover:border-morado/30",
    );

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Nuevo tablero"
      descripcion="Empieza con las columnas Tareas, En curso y Hecho; podrás cambiarlas."
      icono={LayoutGrid}
      color={elegido?.color}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} cargando={crear.isPending} disabled={!nombre.trim()}>
            Crear tablero
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <Campo
          etiqueta="Equipo"
          ayuda={
            elegido
              ? `Lo verán los miembros de ${elegido.nombre}.`
              : "Opcional. Sin equipo, el tablero es personal: solo tú lo ves."
          }
        >
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Equipo del tablero">
            <button
              type="button"
              role="radio"
              aria-checked={equipo === null}
              onClick={() => setEquipo(null)}
              className={opcion(equipo === null)}
              style={equipo === null ? { background: "#32407b", borderColor: "#32407b" } : undefined}
            >
              <Lock className="size-3.5" />
              Personal
            </button>
            {equipos.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={equipo === e.id}
                onClick={() => setEquipo(e.id)}
                className={opcion(equipo === e.id)}
                style={equipo === e.id ? { background: e.color, borderColor: e.color } : undefined}
              >
                <span className="size-2.5 rounded-full" style={{ background: equipo === e.id ? "#fff" : e.color }} />
                {e.nombre}
              </button>
            ))}
          </div>
        </Campo>
        <Campo etiqueta="Nombre">
          <Entrada
            autoFocus
            value={nombre}
            maxLength={100}
            placeholder="Ej. Proyecto planta norte"
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nombre.trim() && void guardar()}
          />
        </Campo>
        <Campo etiqueta="Descripción" ayuda="Opcional.">
          <AreaTexto value={descripcion} rows={3} maxLength={2000} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
      </div>
    </Dialogo>
  );
}
