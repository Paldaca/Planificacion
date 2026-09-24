const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API respondió ${status}`);
    this.status = status;
    this.body = body;
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Wrapper de `fetch` para la API propia de Planificación (no la del Portal):
 * siempre manda la cookie de sesión local (`credentials: "include"`) y
 * adjunta `X-CSRFToken` en métodos no seguros, leyendo la cookie
 * `csrftoken` que Django deja en la primera respuesta (ver
 * `CSRF_COOKIE_HTTPONLY = False` en `backend/Planificacion/settings.py`).
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrftoken = getCookie("csrftoken");
    if (csrftoken) headers.set("X-CSRFToken", csrftoken);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
}
