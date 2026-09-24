import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { redirectToPortalLogin } from "./auth/redirectToPortalLogin";
import { StatusScreen } from "./auth/StatusScreen";
import { useIdentity } from "./auth/useIdentity";
import { usePaldacaEmbed } from "./embed/usePaldacaEmbed";
import { Home } from "./pages/Home";

function App() {
  const { state, refresh } = useIdentity();
  const { embedded, notifyReady, notifySessionExpired, notifyForbidden } = usePaldacaEmbed();

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
      <StatusScreen title="Sesión no iniciada" message="Redirigiendo al login del Portal…" />
    );
  }

  if (state.status === "forbidden") {
    return (
      <StatusScreen
        title="Sin acceso"
        message="Tu cuenta no tiene asignado el módulo de Planificación. Pedile a un administrador del Portal que te lo habilite."
      />
    );
  }

  if (state.status === "unavailable") {
    return (
      <StatusScreen
        title="No podemos confirmar tu sesión"
        message={`Planificación no pudo contactar al Portal para validar tu identidad. ${state.detail}`}
        action={{ label: "Reintentar", onClick: refresh }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home identity={state.identity} />} />
    </Routes>
  );
}

export default App;
