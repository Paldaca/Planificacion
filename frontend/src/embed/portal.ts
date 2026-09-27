/**
 * URL del Portal, sin barra final.
 *
 * En el build que sirve Django, `spa_shell` la escribe en
 * `<meta name="paldaca-portal-url">` desde `settings.PALDACA_PORTAL_URL` (la
 * misma que usa `frame-ancestors`): así un único build sirve en producción y
 * en la Suite local. Si saliera del build (`VITE_PALDACA_PORTAL_URL` de
 * `.env.production`), en local el `postMessage` iría a `https://cpaldaca.com`,
 * el navegador lo descartaría y el Portal nunca recibiría `ready` (se quedaba
 * el aviso «¿No ves el contenido?»). Con Vite (`npm run dev`) no hay meta y
 * vale la variable de `.env.development`.
 */
export const PORTAL_URL = (
  document.querySelector<HTMLMetaElement>('meta[name="paldaca-portal-url"]')?.content ||
  import.meta.env.VITE_PALDACA_PORTAL_URL ||
  ""
).replace(/\/+$/, "");
