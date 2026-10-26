/**
 * SignalBridge Operator Dashboard — Typed Backend API Client
 * Connects directly to Django REST Framework endpoints.
 * Handles automatic CSRF token fetching, session cookies, and standardized errors.
 */

import type {
  AlertDetail,
  AlertSummary,
  AuthUser,
  HealthCheckResponse,
  Incident,
  IncidentDetail,
  IncidentEvent,
  Monitor,
  NotificationDelivery,
  NotificationDestination,
  PaginatedResponse,
  Service,
  WebhookSource,
  IngestionMetric,
  IngestionSummary,
} from '../types';

let cachedCsrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;

  try {
    const res = await fetch('/api/v1/auth/csrf/', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      cachedCsrfToken = data.csrfToken;
      return data.csrfToken;
    }
  } catch (err) {
    console.warn('[API Client] Could not fetch CSRF token:', err);
  }
  return '';
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const token = await getCsrfToken();
    if (token) {
      headers.set('X-CSRFToken', token);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data.error || data.detail || (typeof data === 'object' ? JSON.stringify(data) : 'API request failed');
    const error = new Error(message) as Error & { status?: number; data?: any };
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export const api = {
  // Health
  health: {
    ready: () => request<HealthCheckResponse>('/health/ready/'),
    live: () => request<{ status: string; timestamp: string }>('/health/live/'),
  },

  // Auth
  auth: {
    me: () => request<{ authenticated: boolean; user: AuthUser | null }>('/api/v1/auth/me/'),
    login: (credentials: { username: string; password: string }) =>
      request<{ status: string; user: AuthUser; csrf_token: string }>('/api/v1/auth/login/', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    logout: () =>
      request<{ status: string; message: string }>('/api/v1/auth/logout/', {
        method: 'POST',
      }),
  },

  // Incidents
  incidents: {
    list: (params: Record<string, string | number> = {}) => {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
      });
      const query = search.toString() ? `?${search.toString()}` : '';
      return request<PaginatedResponse<Incident>>(`/api/v1/incidents/${query}`);
    },
    get: (id: string) => request<IncidentDetail>(`/api/v1/incidents/${id}/`),
    acknowledge: (id: string, note?: string) =>
      request<IncidentDetail>(`/api/v1/incidents/${id}/acknowledge/`, {
        method: 'POST',
        body: JSON.stringify({ note: note || '' }),
      }),
    assign: (id: string, assignedTo: string, note?: string) =>
      request<IncidentDetail>(`/api/v1/incidents/${id}/assign/`, {
        method: 'POST',
        body: JSON.stringify({ assigned_to: assignedTo, note: note || '' }),
      }),
    resolve: (id: string, notes: string) =>
      request<IncidentDetail>(`/api/v1/incidents/${id}/resolve/`, {
        method: 'POST',
        body: JSON.stringify({ resolution_notes: notes }),
      }),
    reopen: (id: string, reason: string) =>
      request<IncidentDetail>(`/api/v1/incidents/${id}/reopen/`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    addNote: (id: string, note: string) =>
      request<IncidentEvent>(`/api/v1/incidents/${id}/notes/`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
  },

  // Alerts
  alerts: {
    list: (params: Record<string, string | number> = {}) => {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
      });
      const query = search.toString() ? `?${search.toString()}` : '';
      return request<PaginatedResponse<AlertSummary>>(`/api/v1/alerts/${query}`);
    },
    get: (id: string) => request<AlertDetail>(`/api/v1/alerts/${id}/`),
    retry: (id: string) =>
      request<{ status: string; message: string; payload_id: string }>(`/api/v1/alerts/${id}/retry/`, {
        method: 'POST',
      }),
  },

  // Services & Active Synthetic Monitoring
  services: {
    list: () => request<Service[]>('/api/v1/services/'),
    create: (data: Partial<Service>) =>
      request<Service>('/api/v1/services/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  monitors: {
    list: (serviceId?: string) => {
      const query = serviceId ? `?service_id=${serviceId}` : '';
      return request<Monitor[]>(`/api/v1/monitors/${query}`);
    },
    create: (data: Partial<Monitor>) =>
      request<Monitor>('/api/v1/monitors/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    test: (id: string) =>
      request<{ probe_result: any; monitor: Monitor }>(`/api/v1/monitors/${id}/test/`, {
        method: 'POST',
      }),
  },

  // Webhook Integrations
  integrations: {
    list: () => request<WebhookSource[]>('/api/v1/integrations/'),
    create: (data: { name: string; slug: string; rate_limit_per_minute?: number }) =>
      request<WebhookSource>('/api/v1/integrations/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    patch: (id: string, data: Partial<WebhookSource>) =>
      request<WebhookSource>(`/api/v1/integrations/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    regenerateSecret: (id: string) =>
      request<{ status: string; message: string; integration: WebhookSource }>(
        `/api/v1/integrations/${id}/regenerate-secret/`,
        { method: 'POST' }
      ),
  },

  // Outbound Notifications
  notifications: {
    destinations: () => request<NotificationDestination[]>('/api/v1/notifications/destinations/'),
    createDestination: (data: Partial<NotificationDestination>) =>
      request<NotificationDestination>('/api/v1/notifications/destinations/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    patchDestination: (id: string, data: Partial<NotificationDestination>) =>
      request<NotificationDestination>(`/api/v1/notifications/destinations/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deliveries: (incidentId?: string) => {
      const query = incidentId ? `?incident_id=${incidentId}` : '';
      return request<NotificationDelivery[]>(`/api/v1/notifications/deliveries/${query}`);
    },
  },

  // Global Audit Log
  audit: {
    list: (params: Record<string, string | number> = {}) => {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
      });
      const query = search.toString() ? `?${search.toString()}` : '';
      return request<PaginatedResponse<IncidentEvent>>(`/api/v1/audit/${query}`);
    },
  },

  // Analytics & Ingestion Metrics
  analytics: {
    metrics: (params: { source?: string; from?: string; to?: string; limit?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.source) search.set('source', params.source);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.limit) search.set('limit', String(params.limit));
      const query = search.toString() ? `?${search.toString()}` : '';
      return request<IngestionMetric[]>(`/api/v1/analytics/metrics/${query}`);
    },
    summary: (params: { source?: string; window_minutes?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.source) search.set('source', params.source);
      if (params.window_minutes) search.set('window_minutes', String(params.window_minutes));
      const query = search.toString() ? `?${search.toString()}` : '';
      return request<IngestionSummary>(`/api/v1/analytics/summary/${query}`);
    },
  },
};
