import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents, taskRuns, webhookEvents } from "@/db/schema";

export type LandingMetrics = {
  events24h: number;
  eventsTotal: number;
  duplicatesBlocked: number;
  dedupeRate: number;
  p95LatencyMs: number;
  avgLatencyMs: number;
  openIncidents: number;
  criticalOpen: number;
  incidentsTotal: number;
  correlationRatio: number;
  archivedBytes: number;
  archivedObjects: number;
  verifiedRate: number;
  mttaMinutes: number;
  mttrMinutes: number;
  stageRuns: number;
};

const DAY = 24 * 60 * 60 * 1000;

const FALLBACK_METRICS: LandingMetrics = {
  events24h: 18420,
  eventsTotal: 142850,
  duplicatesBlocked: 4892,
  dedupeRate: 0.265,
  p95LatencyMs: 38,
  avgLatencyMs: 14,
  openIncidents: 3,
  criticalOpen: 1,
  incidentsTotal: 128,
  correlationRatio: 3.4,
  archivedBytes: 89412000,
  archivedObjects: 142850,
  verifiedRate: 0.998,
  mttaMinutes: 4,
  mttrMinutes: 18,
  stageRuns: 571400,
};

export async function getLandingMetrics(): Promise<LandingMetrics> {
  try {
    const since = new Date(Date.now() - DAY);
    const [events] = await db
      .select({
        total: sql<number>`count(*)::int`,
        last24: sql<number>`count(*) filter (where ${webhookEvents.receivedAt} >= ${since})::int`,
        duplicates: sql<number>`count(*) filter (where ${webhookEvents.status} = 'duplicate')::int`,
        verified: sql<number>`count(*) filter (where ${webhookEvents.signatureValid})::int`,
        avgMs: sql<number>`coalesce(round(avg(${webhookEvents.processingMs}))::int, 0)`,
        p95: sql<number>`coalesce(round(percentile_cont(0.95) within group (order by ${webhookEvents.processingMs}))::int, 0)`,
        bytes: sql<number>`coalesce(sum(${webhookEvents.archiveBytes}), 0)::int`,
        objects: sql<number>`count(*) filter (where ${webhookEvents.archiveKey} is not null)::int`,
      })
      .from(webhookEvents);

    const [inc] = await db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${incidents.status} in ('open','acknowledged'))::int`,
        critical: sql<number>`count(*) filter (where ${incidents.status} in ('open','acknowledged') and ${incidents.severity} = 'critical')::int`,
        correlatedEvents: sql<number>`coalesce(sum(${incidents.eventCount}), 0)::int`,
        mtta: sql<number>`coalesce(round(avg(extract(epoch from (${incidents.acknowledgedAt} - ${incidents.firstSeenAt}))/60))::int, 0)`,
        mttr: sql<number>`coalesce(round(avg(extract(epoch from (${incidents.resolvedAt} - ${incidents.firstSeenAt}))/60))::int, 0)`,
      })
      .from(incidents);

    const [tasks] = await db.select({ runs: sql<number>`count(*)::int` }).from(taskRuns);

    const total = Number(events?.total ?? 0);
    const duplicates = Number(events?.duplicates ?? 0);
    const correlatedEvents = Number(inc?.correlatedEvents ?? 0);
    const incidentsTotal = Math.max(1, Number(inc?.total ?? 0));

    return {
      events24h: Number(events?.last24 ?? 0),
      eventsTotal: total,
      duplicatesBlocked: duplicates,
      dedupeRate: total ? duplicates / total : 0,
      p95LatencyMs: Number(events?.p95 ?? 0),
      avgLatencyMs: Number(events?.avgMs ?? 0),
      openIncidents: Number(inc?.open ?? 0),
      criticalOpen: Number(inc?.critical ?? 0),
      incidentsTotal: Number(inc?.total ?? 0),
      correlationRatio: correlatedEvents / incidentsTotal,
      archivedBytes: Number(events?.bytes ?? 0),
      archivedObjects: Number(events?.objects ?? 0),
      verifiedRate: total ? Number(events?.verified ?? 0) / total : 0,
      mttaMinutes: Number(inc?.mtta ?? 0),
      mttrMinutes: Number(inc?.mttr ?? 0),
      stageRuns: Number(tasks?.runs ?? 0),
    };
  } catch (err) {
    console.warn("[Metrics] DB offline or unreachable, serving demo metrics fallback:", (err as any)?.message || err);
    return FALLBACK_METRICS;
  }
}

export type HourBucket = { hour: string; total: number; duplicates: number; critical: number };

export async function getHourlyVolume(hours = 24): Promise<HourBucket[]> {
  try {
    const since = new Date(Date.now() - hours * 3_600_000);
    const rows = await db
      .select({
        hour: sql<string>`to_char(date_trunc('hour', ${webhookEvents.receivedAt}), 'YYYY-MM-DD HH24:MI')`,
        total: sql<number>`count(*)::int`,
        duplicates: sql<number>`count(*) filter (where ${webhookEvents.status} = 'duplicate')::int`,
        critical: sql<number>`count(*) filter (where ${webhookEvents.severity} = 'critical')::int`,
      })
      .from(webhookEvents)
      .where(gte(webhookEvents.receivedAt, since))
      .groupBy(sql`date_trunc('hour', ${webhookEvents.receivedAt})`)
      .orderBy(sql`date_trunc('hour', ${webhookEvents.receivedAt})`);
    return rows;
  } catch {
    return Array.from({ length: 12 }, (_, i) => ({
      hour: `${String(i * 2).padStart(2, "0")}:00`,
      total: 120 + ((i * 37) % 80),
      duplicates: 30 + ((i * 11) % 20),
      critical: i % 4 === 0 ? 8 : 1,
    }));
  }
}

export async function getServiceBreakdown(limit = 6) {
  try {
    return await db
      .select({
        service: webhookEvents.service,
        total: sql<number>`count(*)::int`,
        critical: sql<number>`count(*) filter (where ${webhookEvents.severity} = 'critical')::int`,
        avgMs: sql<number>`coalesce(round(avg(${webhookEvents.processingMs}))::int, 0)`,
      })
      .from(webhookEvents)
      .groupBy(webhookEvents.service)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
  } catch {
    return [
      { service: "payment-api", total: 4200, critical: 12, avgMs: 14 },
      { service: "auth-gateway", total: 3100, critical: 3, avgMs: 9 },
      { service: "billing-worker", total: 1850, critical: 0, avgMs: 18 },
    ];
  }
}

export async function getStageMix() {
  try {
    return await db
      .select({
        stage: taskRuns.stage,
        runs: sql<number>`count(*)::int`,
        avgMs: sql<number>`coalesce(round(avg(${taskRuns.durationMs}))::int, 0)`,
        failed: sql<number>`count(*) filter (where ${taskRuns.status} = 'failed')::int`,
        skipped: sql<number>`count(*) filter (where ${taskRuns.status} = 'skipped')::int`,
      })
      .from(taskRuns)
      .groupBy(taskRuns.stage);
  } catch {
    return [
      { stage: "verify", runs: 14200, avgMs: 2, failed: 8, skipped: 0 },
      { stage: "deduplicate", runs: 14192, avgMs: 3, failed: 0, skipped: 0 },
      { stage: "normalize", runs: 10420, avgMs: 4, failed: 0, skipped: 0 },
      { stage: "correlate", runs: 10420, avgMs: 6, failed: 0, skipped: 0 },
      { stage: "escalate", runs: 10420, avgMs: 1, failed: 0, skipped: 0 },
      { stage: "archive", runs: 10420, avgMs: 8, failed: 0, skipped: 0 },
    ];
  }
}

export async function getRecentEvents(limit = 25, filters?: { severity?: string; status?: string }) {
  try {
    const where = [];
    if (filters?.severity && filters.severity !== "all") {
      where.push(eq(webhookEvents.severity, filters.severity));
    }
    if (filters?.status && filters.status !== "all") {
      where.push(eq(webhookEvents.status, filters.status));
    }
    return await db
      .select()
      .from(webhookEvents)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function getIncidents(filters?: { status?: string; severity?: string; limit?: number; search?: string }): Promise<(typeof incidents.$inferSelect)[]> {
  try {
    const where = [];
    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim().slice(0, 120)}%`;
      where.push(sql`(${incidents.ref} ilike ${term} or ${incidents.title} ilike ${term} or ${incidents.service} ilike ${term})`);
    }
    if (filters?.status && filters.status !== "all") {
      if (filters.status === "active") {
        where.push(inArray(incidents.status, ["open", "acknowledged"]));
      } else {
        where.push(eq(incidents.status, filters.status));
      }
    }
    if (filters?.severity && filters.severity !== "all") {
      where.push(eq(incidents.severity, filters.severity));
    }
    return await db
      .select()
      .from(incidents)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(incidents.lastSeenAt))
      .limit(filters?.limit ?? 40);
  } catch {
    return [
      {
        id: 1,
        ref: "INC-1047",
        title: "Checkout API degraded under peak traffic",
        service: "payment-api",
        severity: "critical",
        status: "open",
        fingerprint: "fp-checkout-api-degraded",
        eventCount: 47,
        escalationLevel: 2,
        assignee: null,
        summary: "P95 latency spike above SLA threshold",
        firstSeenAt: new Date(Date.now() - 3600000),
        lastSeenAt: new Date(Date.now() - 60000),
        acknowledgedAt: null,
        resolvedAt: null,
      },
      {
        id: 2,
        ref: "INC-1048",
        title: "Celery queue saturation in worker pool",
        service: "billing-worker",
        severity: "warning",
        status: "acknowledged",
        fingerprint: "fp-celery-worker-queue",
        eventCount: 18,
        escalationLevel: 1,
        assignee: "jordan.ok",
        summary: "Queue depth exceeded threshold",
        firstSeenAt: new Date(Date.now() - 7200000),
        lastSeenAt: new Date(Date.now() - 1200000),
        acknowledgedAt: new Date(Date.now() - 1100000),
        resolvedAt: null,
      },
    ];
  }
}
