import { PORTAL_URL } from "@/embed/portal";

export function redirectToPortalLogin(loginUrl: string | null) {
  const target = loginUrl || (PORTAL_URL ? `${PORTAL_URL}/login` : "/");
  // `window.top`, no `window`: si estuviéramos embebidos y esto se
  // ejecutara, navegaría el iframe entero fuera del Portal en vez de solo
  // el área de trabajo. En la práctica, cuando SÍ estamos embebidos este
  // caso no debería dispararse — el shell ya reacciona al `session-expired`
  // — pero sirve de red de seguridad, igual que el frame-busting de
  // `Portal-Paldaca/frontend/src/pages/LoginPage.tsx`.
  window.top!.location.assign(target);
}
