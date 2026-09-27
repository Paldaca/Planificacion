import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChartGantt,
  Ellipsis,
  FileSpreadsheet,
  FileUp,
  LayoutTemplate,
  Lock,
  Pencil,
  RefreshCw,
  Settings2,
  UsersRound,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import {
  useArchivadas,
  useArchivarCard,
  useArchivarTablero,
  useDependencias,
  useEditarTablero,
  useExportar,
  useTablero,
} from "@/api/queries";
import type { CardResumen, Vista } from "@/api/tipos";
import { CardDialogo } from "@/components/card/CardDialogo";
import { Encabezado } from "@/components/layout/Encabezado";
import { GuardarPlantillaDialogo } from "@/components/plantillas/GuardarPlantillaDialogo";
import { ConfiguracionDialogo } from "@/components/tablero/ConfiguracionDialogo";
import { BarraFiltros } from "@/components/tablero/Filtros";
import { FILTROS_VACIOS, filtrar, hayFiltros, type EstadoFiltros } from "@/lib/filtros";
import { ImportarDialogo } from "@/components/tablero/ImportarDialogo";
import { Kanban } from "@/components/tablero/Kanban";
import { SelectorVista } from "@/components/tablero/SelectorVista";
import { CuerpoTarjeta } from "@/components/tablero/Tarjeta";
import { PilaAvatares } from "@/components/ui/Avatar";
import { Boton } from "@/components/ui/Boton";
import { Dialogo } from "@/components/ui/Dialogo";
import { Entrada, Campo, AreaTexto } from "@/components/ui/Campos";
import { Esqueleto, Pildora, Vacio } from "@/components/ui/Estados";
import { ItemMenu, Menu, SeparadorMenu } from "@/components/ui/Menu";
import { useAlAbrir } from "@/hooks/useAlAbrir";
import { moduloDiferido, useModuloDiferido } from "@/hooks/useModuloDiferido";
import { ContextoConfigTablero, useValorConfigTablero } from "@/hooks/useConfigTablero";
import { useTitulo } from "@/hooks/useTitulo";
import { useVista } from "@/hooks/useVista";
import { VistaLista } from "@/components/vistas/VistaLista";
import { ROLES } from "@/lib/estilos";

// Calendario y Gantt se cargan al elegirlos: el Kanban abre sin su peso. Su
// código se pide al montar la página (en paralelo con los datos, no en
// cascada) y al acercarse a su botón.
const moduloCalendario = moduloDiferido(() => import("@/components/vistas/VistaCalendario"));
const moduloGantt = moduloDiferido(() => import("@/components/gantt/VistaGantt"));

function precargarVista(vista: Vista) {
  const modulo = vista === "gantt" ? moduloGantt : vista === "calendario" ? moduloCalendario : null;
  modulo?.cargar().catch(() => {}); // si falla, la vista lo muestra al abrirse
}

export default function TableroPage() {
  const { tableroId } = useParams();
  const id = Number(tableroId);
  const navigate = useNavigate();
  const { search } = useLocation();
  const [vista, setVista] = useVista(id);
  const { data: tablero, error, isLoading } = useTablero(id);
  const [filtros, setFiltros] = useState<EstadoFiltros>(FILTROS_VACIOS);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [editando, setEditando] = useState(false);
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);
  const archivarTablero = useArchivarTablero(id);
  const exportar = useExportar(id);
  const [importando, setImportando] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
  const config = useValorConfigTablero(tablero);

  useTitulo(tablero?.nombre);
  const calendario = useModuloDiferido(moduloCalendario, vista === "calendario");
  const gantt = useModuloDiferido(moduloGantt, vista === "gantt");
  // Las dependencias del Gantt se piden junto con el tablero, no tras su primer render.
  useDependencias(id, vista === "gantt");
  const diferida = vista === "gantt" ? gantt : calendario;

  // Una etiqueta eliminada deja de filtrar (si no, el tablero quedaría vacío sin chip que quitar).
  const vigentes = useMemo(
    () =>
      filtros.etiquetas.every((e) => config.etiquetas.has(e))
        ? filtros
        : { ...filtros, etiquetas: filtros.etiquetas.filter((e) => config.etiquetas.has(e)) },
    [filtros, config.etiquetas],
  );
  const visibles = useMemo(() => (tablero ? filtrar(tablero.cards, vigentes) : []), [tablero, vigentes]);
  // La vista viaja en la URL de la tarjeta abierta: al cerrarla se vuelve a la misma vista.
  const abrir = useCallback((card: CardResumen) => navigate(`cards/${card.numero}${search}`), [navigate, search]);

  if (error) {
    const prohibido = error instanceof ApiError && error.status === 403;
    return (
      <Vacio
        icono={Lock}
        titulo={prohibido ? "No tienes acceso a este tablero" : "Tablero no encontrado"}
        texto={
          prohibido
            ? "Es un tablero personal de otra persona o de un equipo del que no eres miembro. Si deberías verlo, pide a un administrador del equipo que te invite."
            : "Puede que lo hayan archivado o que el enlace esté incompleto."
        }
        accion={
          <Link to="/tableros">
            <Boton variante="secundario">
              <ArrowLeft />
              Ver mis tableros
            </Boton>
          </Link>
        }
      />
    );
  }

  if (isLoading || !tablero) return <CargandoTablero />;

  const { permisos } = tablero;

  return (
    <ContextoConfigTablero.Provider value={config}>
      <Encabezado
        antetitulo={
          <span className="inline-flex items-center gap-2">
            <Link to="/tableros" className="inline-flex items-center gap-1 transition-colors hover:text-morado">
              <ArrowLeft className="size-3.5" />
              Tableros
            </Link>
            <span className="text-tenue/40">/</span>
            {tablero.equipo ? (
              <Link to={`/equipos/${tablero.equipo.id}`}>
                <Pildora color={tablero.equipo.color} icono={UsersRound}>
                  {tablero.equipo.nombre}
                </Pildora>
              </Link>
            ) : (
              <Pildora>Personal</Pildora>
            )}
          </span>
        }
        titulo={
          <span className="inline-flex items-center gap-3">
            {tablero.nombre}
            {tablero.archivado && <Pildora color="#b45309">Archivado</Pildora>}
          </span>
        }
        subtitulo={
          <span className="flex flex-wrap items-center gap-3">
            {tablero.descripcion && <span>{tablero.descripcion}</span>}
            {tablero.mi_rol && tablero.tipo === "equipo" && <span>Tu rol: {ROLES[tablero.mi_rol]}</span>}
            {!permisos.editar && !tablero.archivado && (
              <Pildora icono={Lock}>Solo lectura</Pildora>
            )}
            {tablero.tipo === "equipo" && <PilaAvatares personas={tablero.personas} max={5} tamano="sm" />}
          </span>
        }
        acciones={
          <>
            <SelectorVista vista={vista} onCambio={setVista} onPrecargar={precargarVista} />
            <Menu
              disparador={
                <Boton variante="secundario" tamano="sm" cargando={exportar.isPending}>
                  <FileSpreadsheet />
                  Excel / Project
                </Boton>
              }
            >
              <ItemMenu icono={FileSpreadsheet} onSelect={() => exportar.mutate({ formato: "xlsx", filtros: vigentes })}>
                {hayFiltros(vigentes) ? "Exportar lo filtrado a Excel" : "Exportar a Excel"}
              </ItemMenu>
              <ItemMenu icono={ChartGantt} onSelect={() => exportar.mutate({ formato: "xml", filtros: vigentes })}>
                {hayFiltros(vigentes) ? "Exportar lo filtrado a MS Project" : "Exportar a MS Project"}
              </ItemMenu>
              {permisos.editar && (
                <>
                  <SeparadorMenu />
                  <ItemMenu icono={FileUp} onSelect={() => setImportando(true)}>
                    Importar tarjetas…
                  </ItemMenu>
                </>
              )}
            </Menu>
            <Boton variante="secundario" tamano="sm" onClick={() => setVerArchivadas(true)}>
              <Archive />
              Archivadas
            </Boton>
            <Menu
              disparador={
                <Boton variante="secundario" tamano="icono" aria-label="Opciones del tablero">
                  <Ellipsis />
                </Boton>
              }
            >
              {permisos.gestionar && (
                <>
                  <ItemMenu icono={Pencil} onSelect={() => setEditando(true)}>
                    Editar nombre y descripción
                  </ItemMenu>
                  <ItemMenu icono={Settings2} onSelect={() => setConfigurando(true)}>
                    Etiquetas y campos…
                  </ItemMenu>
                </>
              )}
              <ItemMenu icono={LayoutTemplate} onSelect={() => setGuardandoPlantilla(true)}>
                Guardar como plantilla…
              </ItemMenu>
              {permisos.archivar && !tablero.archivado && (
                <>
                  <SeparadorMenu />
                  <ItemMenu icono={Archive} peligro onSelect={() => setConfirmarArchivo(true)}>
                    Archivar tablero
                  </ItemMenu>
                </>
              )}
            </Menu>
            {tablero.archivado && permisos.archivar && (
              <Boton
                variante="suave"
                tamano="sm"
                onClick={() => archivarTablero.mutate(false, { onSuccess: () => toast.success("Tablero restaurado") })}
              >
                <ArchiveRestore />
                Restaurar tablero
              </Boton>
            )}
          </>
        }
      />

      <BarraFiltros
        filtros={vigentes}
        onCambio={setFiltros}
        personas={tablero.personas}
        etiquetas={tablero.etiquetas}
        total={tablero.cards.length}
        visibles={visibles.length}
      />

      {vista === "tablero" && <Kanban tablero={tablero} visibles={visibles} filtrando={hayFiltros(vigentes)} onAbrir={abrir} />}
      {vista === "lista" && <VistaLista tablero={tablero} visibles={visibles} onAbrir={abrir} />}
      {calendario.modulo && <calendario.modulo.VistaCalendario tablero={tablero} visibles={visibles} onAbrir={abrir} />}
      {gantt.modulo && <gantt.modulo.VistaGantt tablero={tablero} visibles={visibles} onAbrir={abrir} />}
      {(vista === "gantt" || vista === "calendario") &&
        !diferida.modulo &&
        (diferida.error ? (
          <Vacio
            icono={RefreshCw}
            titulo="No se pudo cargar esta vista"
            texto="Puede que la conexión haya fallado o que haya una versión nueva del programa."
            accion={
              <Boton variante="secundario" onClick={diferida.reintentar}>
                <RefreshCw />
                Reintentar
              </Boton>
            }
          />
        ) : (
          <Esqueleto className="h-[60vh] rounded-2xl" />
        ))}

      <ImportarDialogo tableroId={id} abierto={importando} onCerrar={() => setImportando(false)} />
      <ConfiguracionDialogo tablero={tablero} abierto={configurando} onCerrar={() => setConfigurando(false)} />
      <GuardarPlantillaDialogo tablero={tablero} abierto={guardandoPlantilla} onCerrar={() => setGuardandoPlantilla(false)} />

      <PanelArchivadas tableroId={id} abierto={verArchivadas} onCerrar={() => setVerArchivadas(false)} puedeRestaurar={permisos.editar} />

      <EditarTableroDialogo
        abierto={editando}
        onCerrar={() => setEditando(false)}
        id={id}
        nombre={tablero.nombre}
        descripcion={tablero.descripcion}
      />

      <Dialogo
        abierto={confirmarArchivo}
        onCambio={setConfirmarArchivo}
        titulo="¿Archivar este tablero?"
        descripcion={
          tablero.equipo
            ? "Deja de aparecer para el equipo. Los administradores pueden restaurarlo desde la página del equipo."
            : "Deja de aparecer en tus tableros. Puedes restaurarlo desde Tableros → Personales → Archivados."
        }
        icono={Archive}
        color="#dc2626"
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setConfirmarArchivo(false)}>
              Cancelar
            </Boton>
            <Boton
              className="bg-[#dc2626] hover:bg-[#b91c1c]"
              cargando={archivarTablero.isPending}
              onClick={() =>
                archivarTablero.mutate(true, {
                  onSuccess: () => {
                    toast("Tablero archivado", { description: tablero.nombre });
                    navigate(tablero.equipo ? `/equipos/${tablero.equipo.id}` : "/tableros");
                  },
                })
              }
            >
              Archivar
            </Boton>
          </>
        }
      >
        <p className="text-sm text-tenue">Las tarjetas se conservan tal cual; nada se borra.</p>
      </Dialogo>

      <Outlet />
    </ContextoConfigTablero.Provider>
  );
}

/** Ruta hija `cards/:numero`: la tarjeta abierta sobre el tablero. */
export function TarjetaAbierta() {
  const { tableroId, numero } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  return (
    <CardDialogo
      key={`${tableroId}-${numero}`}
      tableroId={Number(tableroId)}
      numero={Number(numero)}
      onCerrar={() => navigate(`/tableros/${tableroId}${search}`)}
      onTrasladada={(card) => navigate(`/tableros/${card.tablero.id}/cards/${card.numero}`, { replace: true })}
    />
  );
}

function CargandoTablero() {
  return (
    <div>
      <Esqueleto className="mb-3 h-4 w-48" />
      <Esqueleto className="mb-8 h-9 w-72" />
      <div className="flex gap-3.5 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[300px] shrink-0 space-y-2.5 rounded-[18px] bg-columna/70 p-3">
            <Esqueleto className="h-5 w-28" />
            {Array.from({ length: 3 - i }).map((_, j) => (
              <Esqueleto key={j} className="h-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelArchivadas({
  tableroId,
  abierto,
  onCerrar,
  puedeRestaurar,
}: {
  tableroId: number;
  abierto: boolean;
  onCerrar: () => void;
  puedeRestaurar: boolean;
}) {
  const { data, isLoading, isFetching } = useArchivadas(tableroId, abierto);
  // Sin tarjetas en caché y buscando: se muestra «cargando», no «vacío».
  const cargando = isLoading || (isFetching && !data?.length);
  const restaurar = useArchivarCard(tableroId);
  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Tarjetas archivadas"
      descripcion="Nada se borra: puedes devolverlas al tablero cuando quieras."
      icono={Archive}
      ancho="lg"
    >
      {cargando ? (
        <div className="space-y-2">
          <Esqueleto className="h-16" />
          <Esqueleto className="h-16" />
        </div>
      ) : data && data.length ? (
        <ul className="space-y-2.5">
          {data.map((card) => (
            <li key={card.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <CuerpoTarjeta card={card} />
              </div>
              {puedeRestaurar && (
                <Boton
                  variante="suave"
                  tamano="sm"
                  cargando={restaurar.isPending && restaurar.variables?.card.id === card.id}
                  onClick={() =>
                    restaurar.mutate(
                      { card, archivada: false },
                      { onSuccess: () => toast.success("Tarjeta restaurada", { description: card.titulo }) },
                    )
                  }
                >
                  <ArchiveRestore />
                  Restaurar
                </Boton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-tenue">No hay tarjetas archivadas.</p>
      )}
    </Dialogo>
  );
}

function EditarTableroDialogo({
  abierto,
  onCerrar,
  id,
  nombre,
  descripcion,
}: {
  abierto: boolean;
  onCerrar: () => void;
  id: number;
  nombre: string;
  descripcion: string;
}) {
  const editar = useEditarTablero(id);
  const [valores, setValores] = useState({ nombre, descripcion });

  useAlAbrir(abierto, () => setValores({ nombre, descripcion }));

  return (
    <Dialogo
      abierto={abierto}
      onCambio={(v) => !v && onCerrar()}
      titulo="Editar tablero"
      icono={Pencil}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            cargando={editar.isPending}
            disabled={!valores.nombre.trim()}
            onClick={() => editar.mutate(valores, { onSuccess: onCerrar })}
          >
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Nombre">
          <Entrada value={valores.nombre} maxLength={100} onChange={(e) => setValores({ ...valores, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="Descripción">
          <AreaTexto value={valores.descripcion} maxLength={2000} onChange={(e) => setValores({ ...valores, descripcion: e.target.value })} />
        </Campo>
      </div>
    </Dialogo>
  );
}
