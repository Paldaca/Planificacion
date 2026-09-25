import { Tooltip } from "radix-ui";
import { lazy, Suspense, useEffect } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Compass } from "lucide-react";

import { registrarSesionExpirada } from "./api/client";
import { IdentidadProvider } from "./auth/identidad";
import { redirectToPortalLogin } from "./auth/redirectToPortalLogin";
import { StatusScreen } from "./auth/StatusScreen";
import { useIdentity } from "./auth/useIdentity";
import { Shell } from "./components/layout/Shell";
import { Boton } from "./components/ui/Boton";
import { Vacio } from "./components/ui/Estados";
import { usePaldacaEmbed } from "./embed/usePaldacaEmbed";
import { Esqueleto } from "./components/ui/Estados";

// Carga diferida por página: el tablero (arrastrar y soltar) no se descarga
// hasta que alguien abre uno.
const MisTareasPage = lazy(() => import("./pages/MisTareasPage"));
const TablerosPage = lazy(() => import("./pages/TablerosPage"));
const TableroPage = lazy(() => import("./pages/TableroPage"));
const TarjetaAbierta = lazy(() => import("./pages/TableroPage").then((m) => ({ default: m.TarjetaAbierta })));
const EquiposPage = lazy(() => import("./pages/EquiposPage"));
const EquipoPage = lazy(() => import("./pages/EquipoPage"));
const InvitacionesPage = lazy(() => import("./pages/InvitacionesPage"));

function CargandoPagina() {
  return (
    <div className="space-y-4">
      <Esqueleto className="h-4 w-40" />
      <Esqueleto className="h-9 w-72" />
      <Esqueleto className="h-48 rounded-[22px]" />
    </div>
  );
}

function App() {
  const { state, refresh } = useIdentity();
  const { embedded, notifyReady, notifySessionExpired, notifyForbidden } = usePaldacaEmbed();

  // Si una llamada de la API responde 401 a mitad de uso, se revalida la
  // identidad: eso lleva a la misma pantalla/aviso que un 401 al entrar.
  useEffect(() => {
    registrarSesionExpirada(() => void refresh());
    return () => registrarSesionExpirada(null);
  }, [refresh]);

  useEffect(() => {
    if (state.status === "ok") {
      notifyReady();
    } else if (state.status === "unauthorized") {
      if (embedded) {
        // El shell escucha esto, revalida su propia sesión y, si de verdad
        // murió, lleva al usuario a /login él mismo — nunca hay que navegar
        // el iframe al login del Portal (se vería el login incrustado en el
        // área de trabajo, sin forma de completar el flujo).
        notifySessionExpired();
      } else {
        redirectToPortalLogin(state.loginUrl);
      }
    } else if (state.status === "forbidden" && embedded) {
      notifyForbidden();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, embedded]);

  if (state.status === "loading") {
    return null; // el overlay del shell (si estamos embebidos) sigue visible
  }

  if (state.status === "unauthorized") {
    return embedded ? null : (
      <StatusScreen titulo="Sesión no iniciada" mensaje="Redirigiendo al inicio de sesión del Portal…" cargando />
    );
  }

  if (state.status === "forbidden") {
    return (
      <StatusScreen
        titulo="Sin acceso a Planificación"
        mensaje="Tu cuenta no tiene asignado este módulo. Pide a un administrador del Portal que te lo habilite."
      />
    );
  }

  if (state.status === "unavailable") {
    return (
      <StatusScreen
        titulo="No podemos confirmar tu sesión"
        mensaje={`Planificación no pudo contactar al Portal para validar tu identidad. ${state.detail}`}
        accion={{ etiqueta: "Reintentar", onClick: refresh }}
      />
    );
  }

  return (
    <IdentidadProvider identidad={state.identity}>
      <Tooltip.Provider>
        <Shell>
          <Suspense fallback={<CargandoPagina />}>
          <Routes>
            <Route path="/" element={<Navigate to="/mis-tareas" replace />} />
            <Route path="/mis-tareas" element={<MisTareasPage />} />
            <Route path="/tableros" element={<TablerosPage />} />
            <Route path="/tableros/:tableroId" element={<TableroPage />}>
              <Route path="cards/:numero" element={<TarjetaAbierta />} />
            </Route>
            <Route path="/equipos" element={<EquiposPage />} />
            <Route path="/equipos/:equipoId" element={<EquipoPage />} />
            <Route path="/invitaciones" element={<InvitacionesPage />} />
            <Route
              path="*"
              element={
                <Vacio
                  icono={Compass}
                  titulo="Esta página no existe"
                  texto="Puede que el enlace esté incompleto."
                  accion={
                    <Link to="/mis-tareas">
                      <Boton>Ir a Mis tareas</Boton>
                    </Link>
                  }
                />
              }
            />
          </Routes>
          </Suspense>
        </Shell>
      </Tooltip.Provider>
    </IdentidadProvider>
  );
}

export default App;
