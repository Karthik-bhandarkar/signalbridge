/**
 * SignalBridge Operator Dashboard — TypeScript Type Definitions
 */

export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface IncidentEvent {
  id: string;
  event_type: 'CREATED' | 'ALERT_ATTACHED' | 'SEVERITY_ESCALATED' | 'ACKNOWLEDGED' | 'ASSIGNED' | 'RESOLVED' | 'REOPENED' | 'NOTE_ADDED';
  description: string;
  actor: string;
  created_at: string;
}

export interface AlertSummary {
  id: string;
  service_name: string;
  fingerprint: string;
  severity: SeverityLevel;
  title: string;
  external_id: string;
  deduplication_hash: string;
  content_hash: string;
  source_slug: string;
  source_name: string;
  tracking_id: string;
  created_at: string;
}

export interface AlertDetail extends AlertSummary {
  description: string;
  raw_metadata: Record<string, any>;
  archive_status: 'NOT_STARTED' | 'PENDING' | 'ARCHIVED' | 'FAILED';
  s3_payload_key: string | null;
  updated_at: string;
}

export interface Incident {
  id: string;
  service_name: string;
  fingerprint: string;
  status: IncidentStatus;
  severity: SeverityLevel;
  alert_count: number;
  assigned_to: string;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  duration_seconds: number;
}

export interface IncidentDetail extends Incident {
  resolution_notes: string;
  alerts: AlertSummary[];
  events: IncidentEvent[];
}

export interface WebhookSource {
  id: string;
  name: string;
  slug: string;
  secret_key: string;
  is_active: boolean;
  rate_limit_per_minute: number;
  total_payloads: number;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  tier: 'TIER_0' | 'TIER_1' | 'TIER_2';
  is_active: boolean;
  monitors_count: number;
  active_incidents_count: number;
  created_at: string;
  updated_at: string;
}

export interface MonitorCheckResult {
  id: string;
  status: 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';
  response_time_ms: number;
  status_code: number | null;
  error_message: string;
  checked_at: string;
}

export interface Monitor {
  id: string;
  service: string;
  service_name: string;
  service_slug: string;
  name: string;
  monitor_type: 'HTTP_GET' | 'HTTP_POST' | 'TCP_PORT' | 'SSL_CERT';
  target_url: string;
  interval_seconds: number;
  timeout_seconds: number;
  failure_threshold: number;
  current_status: 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';
  consecutive_failures: number;
  last_response_time_ms: number;
  last_checked_at: string | null;
  is_active: boolean;
  recent_checks?: MonitorCheckResult[];
}

export interface NotificationDestination {
  id: string;
  name: string;
  destination_type: 'WEBHOOK' | 'SLACK' | 'PAGERDUTY' | 'CONSOLE';
  endpoint_url: string;
  auth_header?: string;
  is_active: boolean;
  deliveries_count: number;
  created_at: string;
}

export interface NotificationDelivery {
  id: string;
  incident: string;
  destination: string;
  destination_name: string;
  destination_type: string;
  status: 'DELIVERED' | 'FAILED';
  event_type: string;
  payload_snapshot: Record<string, any>;
  response_status_code: number | null;
  error_message: string;
  delivered_at: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  role: 'VIEWER' | 'OPERATOR' | 'ADMIN';
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface HealthCheckResponse {
  status: 'ready' | 'unready' | 'live';
  checks: {
    database?: { status: string; vendor?: string };
    redis?: { status: string };
  };
  timestamp: string;
}

export interface IngestionMetric {
  id: string;
  source_slug: string;
  window_start: string;
  total_received: number;
  total_accepted: number;
  total_duplicates: number;
  total_rejected: number;
  rejected_auth: number;
  rejected_rate_limit: number;
  rejected_malformed: number;
  rejected_inactive: number;
  rejected_server_error: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  max_latency_ms: number;
  created_at: string;
}

export interface IngestionSummary {
  window_minutes: number;
  total_received: number;
  total_accepted: number;
  total_duplicates: number;
  total_rejected: number;
  acceptance_rate_pct: number;
  p95_latency_ms: number;
  rejections_by_category: {
    auth: number;
    rate_limit: number;
    malformed: number;
    inactive: number;
    server_error: number;
  };
  active_sources_count: number;
  timestamp: string;
}
