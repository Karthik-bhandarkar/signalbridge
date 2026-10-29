/**
 * SignalBridge Master API Client
 * ==============================
 * Single point of egress for all HTTP communication with the SignalBridge Django backend.
 *
 * Guarantees:
 * 1. Strict trailing slash enforcement on all endpoints.
 * 2. Fresh document.cookie CSRF token extraction on every unsafe mutation.
 * 3. Automatic 403 CSRF refresh & one-time retry.
 * 4. Automatic 401 unauthenticated session handling without redirect loops.
 * 5. Cross-tab session sync via BroadcastChannel.
 * 6. Normalized error shape: { status: number, message: string, code?: string }.
 */

export interface ApiErrorPayload {
  status: number;
  message: string;
  code?: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = payload.status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

function getCsrfTokenFromCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function ensureTrailingSlash(path: string): string {
  const [urlPath, queryString] = path.split("?");
  const normalizedPath = urlPath.endsWith("/") ? urlPath : `${urlPath}/`;
  return queryString !== undefined ? `${normalizedPath}?${queryString}` : normalizedPath;
}

// Same-tab and cross-tab session synchronization
const authChannel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("sb_auth_sync")
    : null;

const localAuthListeners = new Set<(type: "LOGIN" | "LOGOUT", payload?: unknown) => void>();

export function broadcastAuthChange(type: "LOGIN" | "LOGOUT", payload?: unknown) {
  // 1. Immediately notify local tab listeners (since BroadcastChannel excludes sender tab)
  localAuthListeners.forEach((cb) => {
    try {
      cb(type, payload);
    } catch {
      // Ignore callback errors
    }
  });

  // 2. Broadcast to other open tabs
  if (authChannel) {
    try {
      authChannel.postMessage({ type, payload, timestamp: Date.now() });
    } catch {
      // Ignore channel errors
    }
  }
}

export function subscribeToAuthChanges(callback: (type: "LOGIN" | "LOGOUT", payload?: unknown) => void) {
  localAuthListeners.add(callback);
  const handler = (event: MessageEvent) => {
    if (event.data?.type) {
      callback(event.data.type, event.data.payload);
    }
  };
  if (authChannel) {
    authChannel.addEventListener("message", handler);
  }
  return () => {
    localAuthListeners.delete(callback);
    if (authChannel) {
      authChannel.removeEventListener("message", handler);
    }
  };
}

export function triggerLoginModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sb_trigger_login_modal"));
  }
}

async function request<T = unknown>(
  url: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const normalizedUrl = ensureTrailingSlash(url);
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  // Attach fresh CSRF token on all unsafe HTTP methods
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const token = getCsrfTokenFromCookie();
    if (token) {
      headers.set("X-CSRFToken", token);
    }
    if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
      headers.set("Content-Type", "application/json");
    }
  }

  // 15-second request timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(normalizedUrl, {
      ...options,
      method,
      headers,
      credentials: "include",
      signal: options.signal || controller.signal,
    });

    clearTimeout(timeoutId);

    // Automatic CSRF rotation retry on HTTP 403
    if (response.status === 403 && !isRetry) {
      const clone = response.clone();
      const bodyText = await clone.text().catch(() => "");
      if (bodyText.includes("CSRF") || bodyText.includes("csrf")) {
        // Fetch fresh CSRF token and retry once
        await apiClient.auth.getCsrf();
        return request<T>(normalizedUrl, options, true);
      }
    }

    // Unauthenticated handling on HTTP 401 (outside /auth/me/)
    if (response.status === 401 && !normalizedUrl.includes("/auth/me/")) {
      broadcastAuthChange("LOGOUT");
      triggerLoginModal();
    }

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { detail: await response.text().catch(() => "Unknown network error") };
      }

      const message =
        errorData.error ||
        errorData.detail ||
        errorData.message ||
        (Array.isArray(errorData) ? errorData.join(", ") : `HTTP ${response.status} Error`);

      throw new ApiError({
        status: response.status,
        message: typeof message === "string" ? message : JSON.stringify(message),
        code: errorData.code,
        details: errorData,
      });
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) throw err;

    const isAbort = err instanceof DOMException && err.name === "AbortError";
    throw new ApiError({
      status: isAbort ? 408 : 0,
      message: isAbort ? "Request timed out after 15 seconds." : (err instanceof Error ? err.message : "Network error"),
      code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
    });
  }
}

export const apiClient = {
  get: <T = unknown>(url: string, init?: RequestInit) => request<T>(url, { ...init, method: "GET" }),
  post: <T = unknown>(url: string, body?: unknown, init?: RequestInit) =>
    request<T>(url, {
      ...init,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T = unknown>(url: string, body?: unknown, init?: RequestInit) =>
    request<T>(url, {
      ...init,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T = unknown>(url: string, init?: RequestInit) => request<T>(url, { ...init, method: "DELETE" }),

  // Domain Typed Helpers
  auth: {
    getCsrf: async () => {
      const res = await request<{ csrfToken: string }>("/api/v1/auth/csrf/");
      return res.csrfToken;
    },
    login: async (username: string, password: string) => {
      // Ensure CSRF cookie is present before submitting credentials
      await apiClient.auth.getCsrf().catch(() => null);
      const res = await apiClient.post<{ status: string; user: any; csrf_token: string }>(
        "/api/v1/auth/login/",
        { username, password }
      );
      broadcastAuthChange("LOGIN", res.user);
      return res;
    },
    logout: async () => {
      try {
        await apiClient.post("/api/v1/auth/logout/");
      } finally {
        broadcastAuthChange("LOGOUT");
      }
    },
    me: async () => {
      return request<{ authenticated: boolean; user: any; csrf_token?: string }>("/api/v1/auth/me/");
    },
  },

  incidents: {
    list: async (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
      return request<any[]>(`/api/v1/public/incidents/${qs}`);
    },
    detail: async (refOrId: string) => {
      return request<any>(`/api/v1/public/incidents/${refOrId}/`);
    },
    acknowledge: async (id: string) => {
      return apiClient.post(`/api/v1/incidents/${id}/acknowledge/`);
    },
    resolve: async (id: string, resolutionNotes?: string) => {
      return apiClient.post(`/api/v1/incidents/${id}/resolve/`, {
        resolution_notes: resolutionNotes || "Resolved via Operator Console.",
      });
    },
    delete: async (id: string) => {
      return apiClient.delete(`/api/v1/public/incidents/${id}/`);
    },
  },

  telemetry: {
    overview: async (includeSimulated = true) => {
      return request<any>(`/api/v1/public/overview/?include_simulated=${includeSimulated}`);
    },
    health: async () => {
      return request<any>("/api/health/");
    },
    version: async () => {
      return request<any>("/api/v1/version/");
    },
    events: async () => {
      return request<any>("/api/v1/events/");
    },
  },

  simulator: {
    dispatch: async (scenario = "payment_gateway_saturation") => {
      return apiClient.post("/api/v1/simulator/dispatch/", { scenario });
    },
    reset: async (scope = "all") => {
      return apiClient.post("/api/v1/simulator/reset/", { scope });
    },
  },
};

