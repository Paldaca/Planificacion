const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

/** URL completa de una ruta de la API: para lo que el navegador pide solo (un `<img>`). */
export const urlApi = (path: string) => `${API_BASE_URL}${path}`;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API respondió ${status}`);
    this.status = status;
    this.body = body;
  }
}

let alExpirarSesion: (() => void) | null = null;

/** App.tsx registra aquí cómo reaccionar si la sesión muere a mitad de uso. */
export function registrarSesionExpirada(fn: (() => void) | null) {
  alExpirarSesion = fn;
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
    // 401 fuera de `me/`: la sesión del Portal expiró mientras se usaba la app.
    if (response.status === 401 && !path.startsWith("/api/auth/")) alExpirarSesion?.();
    throw new ApiError(response.status, body);
  }
  return body as T;
}

function conCuerpo(method: string, datos?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: datos === undefined ? undefined : JSON.stringify(datos),
  };
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, datos?: unknown) => apiFetch<T>(path, conCuerpo("POST", datos ?? {})),
  patch: <T>(path: string, datos: unknown) => apiFetch<T>(path, conCuerpo("PATCH", datos)),
  del: <T = null>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  /** Multipart (archivos). Sin `Content-Type`: el navegador pone el `boundary`. */
  subir: <T>(path: string, datos: FormData) => apiFetch<T>(path, { method: "POST", body: datos }),
};

function nombreDeDescarga(respuesta: Response, porDefecto: string): string {
  const cabecera = respuesta.headers.get("Content-Disposition") ?? "";
  const utf8 = cabecera.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const simple = cabecera.match(/filename="?([^";]+)"?/i);
  return simple ? simple[1] : porDefecto;
}

/**
 * Descarga un archivo de la API con la sesión (cookies). Se pide con `fetch`
 * y se entrega como blob: funciona igual suelta y embebida en el Portal.
 */
export async function descargar(path: string, porDefecto: string): Promise<void> {
  const respuesta = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (!respuesta.ok) {
    const texto = await respuesta.text();
    let cuerpo: unknown = texto;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      // No era JSON: se deja el texto.
    }
    if (respuesta.status === 401) alExpirarSesion?.();
    throw new ApiError(respuesta.status, cuerpo);
  }
  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreDeDescarga(respuesta, porDefecto);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Dar tiempo al navegador a empezar la descarga antes de liberar el blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Mensaje legible de un error de la API (`detail` o el primer error de campo). */
export function mensajeError(error: unknown, porDefecto = "No se pudo completar la acción."): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (body && typeof body === "object") {
      const registro = body as Record<string, unknown>;
      if (typeof registro.detail === "string") return registro.detail;
      for (const valor of Object.values(registro)) {
        if (Array.isArray(valor) && typeof valor[0] === "string") return valor[0];
        if (typeof valor === "string") return valor;
      }
    }
    if (error.status === 403) return "No tienes permiso para hacer esto.";
    if (error.status >= 500) return "El servidor tuvo un problema. Intenta de nuevo.";
  }
  if (error instanceof TypeError) return "Sin conexión con el servidor.";
  return porDefecto;
}
