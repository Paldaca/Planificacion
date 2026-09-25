import "@fontsource/geist-sans/latin-400.css";
import "@fontsource/geist-sans/latin-500.css";
import "@fontsource/geist-sans/latin-600.css";
import "@fontsource/geist-sans/latin-700.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import { ApiError } from "./api/client";
import App from "./App.tsx";

const clienteDatos = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Refrescar al volver a la pestaña (acción real del usuario), nunca por
      // temporizador: ver R-07 en docs/plan-modulo-planificacion.md §6.5.
      refetchOnWindowFocus: true,
      retry: (intentos, error) => !(error instanceof ApiError && error.status < 500) && intentos < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={clienteDatos}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
          <Toaster
            position="top-center"
            richColors
            toastOptions={{ style: { fontFamily: "Geist Sans, Poppins, system-ui, sans-serif", borderRadius: 14 } }}
          />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
