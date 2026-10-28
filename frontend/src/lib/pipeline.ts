import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidentTimeline, incidents, sources, taskRuns, webhookEvents } from "@/db/schema";

export type Severity = "info" | "warning" | "critical";
export type StageName =
  | "verify"
  | "deduplicate"
  | "normalize"
  | "correlate"
  | "escalate"
  | "archive";

export type StageTrace = {
  stage: StageName;
  status: "succeeded" | "skipped" | "failed";
  detail: string;
  durationMs: number;
};

export type IngestResult = {
  ok: boolean;
  httpStatus: number;
  duplicate: boolean;
  dedupeKey: string;
  eventId?: number;
  incidentRef?: string;
  incidentId?: number;
  severity: Severity;
  escalationLevel?: number;
  correlated: boolean;
  archiveKey?: string;
  processingMs: number;
  trace: StageTrace[];
  error?: string;
};

export const CORRELATION_WINDOW_MINUTES = 30;
export const SIGNATURE_HEADER = "x-signalbridge-signature";
export const IDEMPOTENCY_HEADER = "x-idempotency-key";

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

export function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hash(input: string, length = 32) {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

function normalizeSeverity(input: unknown): Severity {
  const value = String(input ?? "").toLowerCase();
  if (["critical", "crit", "fatal", "page", "p1", "sev1", "error", "down"].includes(value)) {
    return "critical";
  }
  if (["info", "informational", "low", "p4", "sev4", "resolved", "ok"].includes(value)) {
    return "info";
  }
  return "warning";
}

type Normalized = {
  eventType: string;
  service: string;
  severity: Severity;
  title: string;
  fingerprint: string;
};

type AnyRecord = Record<string, unknown>;

function pick(obj: AnyRecord, path: string[]): unknown {
  let cursor: unknown = obj;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as AnyRecord)[key];
  }
  return cursor;
}

function firstString(obj: AnyRecord, paths: string[][], fallback: string): string {
  for (const path of paths) {
    const value = pick(obj, path);
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return fallback;
}

/** Provider-agnostic payload normalization. */
export function normalize(payload: AnyRecord, provider: string): Normalized {
  const eventType = firstString(
    payload,
    [["event"], ["type"], ["event_type"], ["alert", "name"], ["action"], ["kind"]],
    `${provider}.event`,
  );
  const service = firstString(
    payload,
    [
      ["service"],
      ["labels", "service"],
      ["resource", "service"],
      ["repository", "name"],
      ["cluster"],
      ["app"],
    ],
    "unassigned",
  );
  const severity = normalizeSeverity(
    pick(payload, ["severity"]) ??
      pick(payload, ["labels", "severity"]) ??
      pick(payload, ["level"]) ??
      pick(payload, ["status"]),
  );
  const title = firstString(
    payload,
    [["title"], ["summary"], ["annotations", "summary"], ["message"], ["description"]],
    `${eventType} on ${service}`,
  );
  return {
    eventType,
    service,
    severity,
    title,
    fingerprint: hash(`${service}::${eventType}`, 16),
  };
}

function escalationFor(eventCount: number, severity: Severity): number {
  let level = 1;
  if (eventCount >= 3) level = 2;
  if (eventCount >= 6) level = 3;
  if (severity === "critical") level = Math.max(level, 2);
  if (severity === "critical" && eventCount >= 3) level = 3;
  return level;
}

async function nextIncidentRef(): Promise<string> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${incidents.id}), 0)` })
    .from(incidents);
  return `INC-${String(1200 + Number(row?.max ?? 0) + 1).padStart(4, "0")}`;
}

export type IngestInput = {
  slug: string;
  rawBody: string;
  signature?: string | null;
  idempotencyKey?: string | null;
  receivedAt?: Date;
  /** Only used by the seeded demo generator to backfill history. */
  internal?: boolean;
};

export async function ingest(input: IngestInput): Promise<IngestResult> {
  const startedAt = Date.now();
  const receivedAt = input.receivedAt ?? new Date();
  const trace: StageTrace[] = [];
  const mark = (
    stage: StageName,
    status: StageTrace["status"],
    detail: string,
    t0: number,
  ): void => {
    trace.push({ stage, status, detail, durationMs: Math.max(1, Date.now() - t0) });
  };

  const [source] = await db.select().from(sources).where(eq(sources.slug, input.slug)).limit(1);
  if (!source || !source.active) {
    return {
      ok: false,
      httpStatus: 404,
      duplicate: false,
      dedupeKey: "",
      severity: "warning",
      correlated: false,
      processingMs: Date.now() - startedAt,
      trace,
      error: `unknown or inactive source '${input.slug}'`,
    };
  }

  // ── Stage 1: signature verification ────────────────────────────────────────
  let t0 = Date.now();
  const expected = sign(input.rawBody, source.secret);
  const provided = (input.signature ?? "").trim();
  const signatureValid = provided.length > 0 && safeEqual(expected, provided);
  if (!signatureValid) {
    mark("verify", "failed", "HMAC-SHA256 mismatch — delivery rejected", t0);
    await db.insert(taskRuns).values({
      stage: "verify",
      status: "failed",
      detail: `rejected delivery for ${source.slug}`,
      durationMs: trace[0].durationMs,
      createdAt: receivedAt,
    });
    return {
      ok: false,
      httpStatus: 401,
      duplicate: false,
      dedupeKey: "",
      severity: "warning",
      correlated: false,
      processingMs: Date.now() - startedAt,
      trace,
      error: "invalid signature",
    };
  }
  mark("verify", "succeeded", `HMAC-SHA256 verified against ${source.slug} signing key`, t0);

  // ── Stage 2: idempotency / dedupe ──────────────────────────────────────────
  t0 = Date.now();
  const dedupeKey = (input.idempotencyKey ?? "").trim() || hash(`${source.slug}:${input.rawBody}`);
  const [existing] = await db
    .select({ id: webhookEvents.id, incidentId: webhookEvents.incidentId })
    .from(webhookEvents)
    .where(eq(webhookEvents.dedupeKey, dedupeKey))
    .limit(1);

  let payload: AnyRecord;
  try {
    payload = JSON.parse(input.rawBody) as AnyRecord;
  } catch {
    payload = { raw: input.rawBody };
  }
  const normalized = normalize(payload, source.provider);

  if (existing) {
    mark("deduplicate", "skipped", `replay of event #${existing.id} — no side effects`, t0);
    const [incident] = existing.incidentId
      ? await db
          .select({ ref: incidents.ref, level: incidents.escalationLevel })
          .from(incidents)
          .where(eq(incidents.id, existing.incidentId))
          .limit(1)
      : [];
    const duplicateRowValues = {
      dedupeKey: `${dedupeKey}:replay:${hash(`${Date.now()}${Math.random()}`, 12)}`,
      sourceSlug: source.slug,
      provider: source.provider,
      eventType: normalized.eventType,
      service: normalized.service,
      severity: normalized.severity,
      status: "duplicate",
      signatureValid: true,
      fingerprint: normalized.fingerprint,
      incidentId: existing.incidentId,
      duplicateOf: existing.id,
      payload,
      processingMs: Date.now() - startedAt,
      receivedAt,
      processedAt: new Date(receivedAt.getTime() + 4),
    };
    const [dupRow] = await db.insert(webhookEvents).values(duplicateRowValues).returning({
      id: webhookEvents.id,
    });
    await db.insert(taskRuns).values([
      {
        stage: "verify",
        status: "succeeded",
        eventId: dupRow.id,
        dedupeKey,
        detail: "signature verified",
        durationMs: trace[0].durationMs,
        createdAt: receivedAt,
      },
      {
        stage: "deduplicate",
        status: "skipped",
        eventId: dupRow.id,
        dedupeKey,
        detail: `duplicate of event #${existing.id}`,
        durationMs: trace[1].durationMs,
        createdAt: receivedAt,
      },
    ]);
    return {
      ok: true,
      httpStatus: 200,
      duplicate: true,
      dedupeKey,
      eventId: dupRow.id,
      incidentId: existing.incidentId ?? undefined,
      incidentRef: incident?.ref,
      severity: normalized.severity,
      escalationLevel: incident?.level,
      correlated: false,
      processingMs: Date.now() - startedAt,
      trace,
    };
  }
  mark("deduplicate", "succeeded", `idempotency key ${dedupeKey.slice(0, 16)}… is new`, t0);

  // ── Stage 3: normalization ─────────────────────────────────────────────────
  t0 = Date.now();
  mark(
    "normalize",
    "succeeded",
    `${normalized.service} · ${normalized.eventType} · ${normalized.severity} · fp ${normalized.fingerprint}`,
    t0,
  );

  // ── Stage 4: correlation ───────────────────────────────────────────────────
  t0 = Date.now();
  const windowStart = new Date(receivedAt.getTime() - CORRELATION_WINDOW_MINUTES * 60_000);
  const [openIncident] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.fingerprint, normalized.fingerprint),
        inArray(incidents.status, ["open", "acknowledged"]),
        gte(incidents.lastSeenAt, windowStart),
      ),
    )
    .limit(1);

  let incidentId: number;
  let incidentRef: string;
  let eventCount: number;
  let severity: Severity = normalized.severity;
  let correlated = false;

  if (openIncident) {
    correlated = true;
    eventCount = openIncident.eventCount + 1;
    severity =
      SEVERITY_RANK[normalized.severity] > SEVERITY_RANK[openIncident.severity as Severity]
        ? normalized.severity
        : (openIncident.severity as Severity);
    incidentId = openIncident.id;
    incidentRef = openIncident.ref;
    mark(
      "correlate",
      "succeeded",
      `joined ${incidentRef} (fingerprint match, ${CORRELATION_WINDOW_MINUTES}m window)`,
      t0,
    );
  } else {
    incidentRef = await nextIncidentRef();
    const [created] = await db
      .insert(incidents)
      .values({
        ref: incidentRef,
        title: normalized.title,
        service: normalized.service,
        severity: normalized.severity,
        status: "open",
        fingerprint: normalized.fingerprint,
        eventCount: 1,
        escalationLevel: escalationFor(1, normalized.severity),
        summary: normalized.title,
        firstSeenAt: receivedAt,
        lastSeenAt: receivedAt,
      })
      .returning({ id: incidents.id });
    incidentId = created.id;
    eventCount = 1;
    mark("correlate", "succeeded", `opened ${incidentRef} — no correlating incident in window`, t0);
    await db.insert(incidentTimeline).values({
      incidentId,
      kind: "opened",
      message: `${incidentRef} opened from ${source.name} · ${normalized.eventType}`,
      actor: "pipeline",
      meta: { fingerprint: normalized.fingerprint, severity: normalized.severity },
      createdAt: receivedAt,
    });
  }

  // ── Stage 5: escalation ────────────────────────────────────────────────────
  t0 = Date.now();
  const previousLevel = openIncident?.escalationLevel ?? escalationFor(1, normalized.severity);
  const nextLevel = escalationFor(eventCount, severity);
  if (openIncident) {
    await db
      .update(incidents)
      .set({
        eventCount,
        severity,
        escalationLevel: nextLevel,
        lastSeenAt: receivedAt,
        title: openIncident.title,
      })
      .where(eq(incidents.id, incidentId));
    await db.insert(incidentTimeline).values({
      incidentId,
      kind: "correlated",
      message: `event correlated — ${eventCount} signals on fingerprint ${normalized.fingerprint}`,
      actor: "pipeline",
      meta: { eventCount },
      createdAt: receivedAt,
    });
  }
  if (nextLevel > previousLevel) {
    await db.insert(incidentTimeline).values({
      incidentId,
      kind: "escalated",
      message: `escalated L${previousLevel} → L${nextLevel} (${eventCount} correlated signals, severity ${severity})`,
      actor: "escalation-policy",
      meta: { from: previousLevel, to: nextLevel },
      createdAt: receivedAt,
    });
    mark("escalate", "succeeded", `policy raised ${incidentRef} to L${nextLevel}`, t0);
  } else {
    mark("escalate", "skipped", `policy held ${incidentRef} at L${nextLevel}`, t0);
  }

  // ── Stage 6: payload archival ──────────────────────────────────────────────
  t0 = Date.now();
  const d = receivedAt;
  const archiveKey = `${process.env.ARCHIVE_BUCKET ?? "signalbridge-archive"}/${d.getUTCFullYear()}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${dedupeKey.slice(0, 20)}.json`;
  const archiveBytes = Buffer.byteLength(input.rawBody, "utf8");
  mark("archive", "succeeded", `${archiveBytes} B retained in PostgreSQL JSONB · archive key ${archiveKey}`, t0);

  const processingMs = Math.max(1, Date.now() - startedAt);
  const [eventRow] = await db
    .insert(webhookEvents)
    .values({
      dedupeKey,
      sourceSlug: source.slug,
      provider: source.provider,
      eventType: normalized.eventType,
      service: normalized.service,
      severity: normalized.severity,
      status: "processed",
      signatureValid: true,
      fingerprint: normalized.fingerprint,
      incidentId,
      payload,
      archiveKey,
      archiveBytes,
      processingMs,
      receivedAt,
      processedAt: new Date(receivedAt.getTime() + processingMs),
    })
    .returning({ id: webhookEvents.id });

  await db.insert(taskRuns).values(
    trace.map((entry) => ({
      stage: entry.stage,
      status: entry.status,
      eventId: eventRow.id,
      dedupeKey,
      detail: entry.detail,
      durationMs: entry.durationMs,
      createdAt: receivedAt,
    })),
  );

  return {
    ok: true,
    httpStatus: 202,
    duplicate: false,
    dedupeKey,
    eventId: eventRow.id,
    incidentId,
    incidentRef,
    severity,
    escalationLevel: nextLevel,
    correlated,
    archiveKey,
    processingMs,
    trace,
  };
}
