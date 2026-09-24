/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_PALDACA_PORTAL_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
