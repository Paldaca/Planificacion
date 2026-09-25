import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Cabecera CSP replicada del backend (ver PALDACA_FRAME_ANCESTORS en
// backend/Planificacion/settings.py): en producción la pone Django sobre el
// build servido (`PaldacaEmbedMiddleware`), pero en dev el documento lo
// sirve el propio servidor de Vite, así que sin esto el iframe del Portal
// no podría embeber esta app en local — un navegador sin CSP explícita no
// bloquea el framing por default, pero probar el mismo comportamiento que
// producción desde el día uno evita sorpresas al desplegar.
const FRAME_ANCESTORS = "'self' http://localhost:5173 http://127.0.0.1:5173";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": `${import.meta.dirname}/src`,
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Librerías en chunks propios: cambian menos que el código del módulo,
        // así un despliegue no obliga a volver a descargarlas.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: "motion", test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
            { name: "radix", test: /node_modules[\\/](@radix-ui|radix-ui|@floating-ui)[\\/]/ },
            { name: "datos", test: /node_modules[\\/](@tanstack|sonner)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5181,
    strictPort: true,
    headers: {
      "Content-Security-Policy": `frame-ancestors ${FRAME_ANCESTORS}`,
    },
  },
  preview: {
    port: 5181,
    strictPort: true,
    headers: {
      "Content-Security-Policy": `frame-ancestors ${FRAME_ANCESTORS}`,
    },
  },
});
