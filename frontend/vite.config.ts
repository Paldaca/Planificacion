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
  plugins: [react()],
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
