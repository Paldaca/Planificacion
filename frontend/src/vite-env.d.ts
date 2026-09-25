/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_PALDACA_PORTAL_URL: string;
  /** Dónde publica el Portal paldaca-nav.js/.css (por defecto `<portal>/static`). */
  readonly VITE_PALDACA_NAV_URL?: string;
  /** API del Portal que consulta paldaca-nav (`/auth/me/`, avisos). */
  readonly VITE_PALDACA_PORTAL_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
