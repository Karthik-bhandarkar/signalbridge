import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Webhook producers registered with the ingest edge. */
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  secret: text("secret").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Incidents produced by correlating related webhook events. */
export const incidents = pgTable(
  "incidents",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    title: text("title").notNull(),
    service: text("service").notNull(),
    severity: text("severity").notNull().default("warning"), // info | warning | critical
    status: text("status").notNull().default("open"), // open | acknowledged | resolved
    fingerprint: text("fingerprint").notNull(),
    eventCount: integer("event_count").notNull().default(1),
    escalationLevel: integer("escalation_level").notNull().default(1),
    assignee: text("assignee"),
    summary: text("summary"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("incidents_status_idx").on(table.status),
    index("incidents_fingerprint_idx").on(table.fingerprint),
  ],
);

/** Every webhook delivery that reached the ingest edge. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    sourceSlug: text("source_slug").notNull(),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    service: text("service").notNull(),
    severity: text("severity").notNull().default("warning"),
    status: text("status").notNull().default("processed"), // processed | duplicate | rejected | failed
    signatureValid: boolean("signature_valid").notNull().default(false),
    fingerprint: text("fingerprint").notNull(),
    incidentId: integer("incident_id"),
    duplicateOf: integer("duplicate_of"),
    payload: jsonb("payload").notNull(),
    archiveKey: text("archive_key"),
    archiveBytes: integer("archive_bytes").notNull().default(0),
    processingMs: integer("processing_ms").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("webhook_events_dedupe_idx").on(table.dedupeKey),
    index("webhook_events_received_idx").on(table.receivedAt),
    index("webhook_events_incident_idx").on(table.incidentId),
  ],
);

/** Append-only audit trail for an incident. */
export const incidentTimeline = pgTable(
  "incident_timeline",
  {
    id: serial("id").primaryKey(),
    incidentId: integer("incident_id").notNull(),
    kind: text("kind").notNull(), // opened | correlated | escalated | acknowledged | resolved | note | archived
    message: text("message").notNull(),
    actor: text("actor").notNull().default("pipeline"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("incident_timeline_incident_idx").on(table.incidentId)],
);

/** One row per pipeline stage execution — the "worker" ledger. */
export const taskRuns = pgTable(
  "task_runs",
  {
    id: serial("id").primaryKey(),
    stage: text("stage").notNull(), // verify | deduplicate | normalize | correlate | escalate | archive
    status: text("status").notNull(), // succeeded | skipped | failed
    eventId: integer("event_id"),
    dedupeKey: text("dedupe_key"),
    detail: text("detail"),
    durationMs: integer("duration_ms").notNull().default(0),
    attempts: integer("attempts").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("task_runs_created_idx").on(table.createdAt)],
);

/** Console operators. */
export const operators = pgTable("operators", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("responder"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Incident = typeof incidents.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type TimelineEntry = typeof incidentTimeline.$inferSelect;
export type TaskRun = typeof taskRuns.$inferSelect;
export type Source = typeof sources.$inferSelect;
