import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../api/client";

export type Identity = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  rol: "usuario" | "administrador";
  /** Equivale a `permisos["planificacion"].admin` del Portal. */
  es_administrador: boolean;
  es_superadmin: boolean;
  disciplina: string | null;
  perfil: string | null;
  /** Códigos de módulo del Portal espejados en la cuenta local. */
  modulos: string[];
  modulo_codigo: string;
};

export type IdentityState =
  | { status: "loading" }
  | { status: "ok"; identity: Identity }
  | { status: "unauthorized"; loginUrl: string | null }
  | { status: "forbidden" }
  | { status: "unavailable"; detail: string };

/**
 * Resuelve identidad contra `GET /api/auth/me/` (backend propio de
 * Planificación, que a su vez hace cookie-forwarding contra el Portal — ver
 * `backend/paldaca_sso/middleware.py`). Este hook es la ÚNICA fuente de
 * verdad de sesión y de permisos en el frontend: sin páginas server-rendered
 * que hagan de gate, es la SPA quien decide qué pantalla mostrar según el
 * status HTTP (401 sin sesión / 403 sin el módulo / 503 Portal caído).
 */
export function useIdentity() {
  const [state, setState] = useState<IdentityState>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const identity = await apiFetch<Identity>("/api/auth/me/");
      setState({ status: "ok", identity });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          const loginUrl =
            typeof err.body === "object" && err.body !== null && "login_url" in err.body
              ? ((err.body as { login_url?: string | null }).login_url ?? null)
              : null;
          setState({ status: "unauthorized", loginUrl });
          return;
        }
        if (err.status === 403) {
          setState({ status: "forbidden" });
          return;
        }
      }
      setState({
        status: "unavailable",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, refresh };
}
