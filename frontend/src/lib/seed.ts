import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidentTimeline, incidents, operators, sources, webhookEvents } from "@/db/schema";
import { DEMO_CREDENTIALS, hashPassword } from "@/lib/auth";
import { ingest, sign } from "@/lib/pipeline";

export const DEMO_SOURCES = [
  {
    slug: "prometheus-prod",
    name: "Prometheus · prod-us-east",
    provider: "prometheus",
    secret: "whsec_prom_8f21c0b4e5d9",
  },
  {
    slug: "github-deploys",
    name: "GitHub Actions · deploys",
    provider: "github",
    secret: "whsec_gha_33ba77e1c4aa",
  },
  {
    slug: "stripe-billing",
    name: "Stripe · billing events",
    provider: "stripe",
    secret: "whsec_stripe_90ef12dd7c",
  },
  {
    slug: "cloudwatch-edge",
    name: "CloudWatch · edge alarms",
    provider: "cloudwatch",
    secret: "whsec_cw_5c7a1be0f4",
  },
];

type Template = {
  slug: string;
  weight: number;
  build: (n: number) => Record<string, unknown>;
};

const TEMPLATES: Template[] = [
  {
    slug: "prometheus-prod",
    weight: 5,
    build: (n) => ({
      event: "alert.firing",
      service: "checkout-api",
      severity: n % 4 === 0 ? "critical" : "warning",
      labels: { service: "checkout-api", severity: n % 4 === 0 ? "critical" : "warning" },
      annotations: { summary: "p99 latency above 850ms on checkout-api" },
      value: 820 + (n % 9) * 31,
    }),
  },
  {
    slug: "prometheus-prod",
    weight: 3,
    build: (n) => ({
      event: "alert.firing",
      service: "payments-worker",
      severity: "critical",
      annotations: { summary: "Celery queue depth exceeded 5k tasks" },
      value: 5000 + n * 37,
    }),
  },
  {
    slug: "cloudwatch-edge",
    weight: 3,
    build: (n) => ({
      event: "alarm.state_change",
      service: "edge-gateway",
      severity: n % 3 === 0 ? "critical" : "warning",
      title: "5xx rate breached 2% on edge-gateway",
      region: "us-east-1",
      datapoints: 3 + (n % 4),
    }),
  },
  {
    slug: "github-deploys",
    weight: 3,
    build: (n) => ({
      event: "workflow_run.completed",
      service: "signalbridge-api",
      severity: n % 5 === 0 ? "critical" : "info",
      repository: { name: "signalbridge-api" },
      conclusion: n % 5 === 0 ? "failure" : "success",
      title:
        n % 5 === 0 ? "Deploy pipeline failed on signalbridge-api" : "Deploy succeeded to prod",
      run: 4120 + n,
    }),
  },
  {
    slug: "stripe-billing",
    weight: 2,
    build: (n) => ({
      event: "invoice.payment_failed",
      service: "billing-sync",
      severity: "warning",
      title: "Invoice payment failed — retry scheduled",
      amount_due: 4900 + n * 13,
    }),
  },
  {
    slug: "prometheus-prod",
    weight: 2,
    build: () => ({
      event: "alert.firing",
      service: "postgres-primary",
      severity: "critical",
      annotations: { summary: "Replication lag above 30s on postgres-primary" },
    }),
  },
  {
    slug: "cloudwatch-edge",
    weight: 2,
    build: () => ({
      event: "alarm.state_change",
      service: "redis-broker",
      severity: "warning",
      title: "Redis broker memory at 82% of maxmemory",
    }),
  },
];

function pickTemplate(rand: () => number): Template {
  const total = TEMPLATES.reduce((sum, t) => sum + t.weight, 0);
  let roll = rand() * total;
  for (const template of TEMPLATES) {
    roll -= template.weight;
    if (roll <= 0) return template;
  }
  return TEMPLATES[0];
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function ensureSources() {
  for (const source of DEMO_SOURCES) {
    const [existing] = await db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.slug, source.slug))
      .limit(1);
    if (!existing) await db.insert(sources).values(source);
  }
}

async function ensureOperators() {
  const [existing] = await db
    .select({ id: operators.id })
    .from(operators)
    .where(eq(operators.email, DEMO_CREDENTIALS.email))
    .limit(1);
  if (!existing) {
    await db.insert(operators).values({
      email: DEMO_CREDENTIALS.email,
      name: "Avery Lin",
      role: "incident-commander",
      passwordHash: hashPassword(DEMO_CREDENTIALS.password),
    });
  }
}

/** Replays `count` deliveries through the real pipeline, backdated across `hours`. */
export async function generateTraffic(count: number, hours = 24, seedValue = Date.now() % 100000) {
  const rand = mulberry32(seedValue);
  const secrets = new Map(DEMO_SOURCES.map((s) => [s.slug, s.secret]));
  const now = Date.now();
  const results: { duplicate: boolean; incidentRef?: string }[] = [];

  for (let i = 0; i < count; i += 1) {
    const template = pickTemplate(rand);
    const body = template.build(i);
    const ts = new Date(now - Math.floor(rand() * hours * 3_600_000));
    const isReplay = rand() < 0.11 && i > 4;
    const raw = JSON.stringify({
      ...body,
      id: isReplay ? `evt_replay_${i % 5}` : `evt_${seedValue}_${i}`,
      ts: ts.toISOString(),
    });
    const secret = secrets.get(template.slug)!;
    const result = await ingest({
      slug: template.slug,
      rawBody: raw,
      signature: sign(raw, secret),
      idempotencyKey: isReplay
        ? `idem_${seedValue}_${i % 5}`
        : `idem_${seedValue}_${i}_${Math.floor(rand() * 1e6)}`,
      receivedAt: ts,
      internal: true,
    });
    results.push({ duplicate: result.duplicate, incidentRef: result.incidentRef });
  }
  return results;
}

async function ageIncidents() {
  const open = await db.select().from(incidents).where(eq(incidents.status, "open"));
  let index = 0;
  for (const incident of open) {
    index += 1;
    if (index % 3 === 0) {
      const ackAt = new Date(incident.firstSeenAt.getTime() + (4 + (index % 7)) * 60_000);
      const resolvedAt = new Date(ackAt.getTime() + (12 + (index % 23)) * 60_000);
      await db
        .update(incidents)
        .set({
          status: "resolved",
          acknowledgedAt: ackAt,
          resolvedAt,
          assignee: "avery.lin",
        })
        .where(eq(incidents.id, incident.id));
      await db.insert(incidentTimeline).values([
        {
          incidentId: incident.id,
          kind: "acknowledged",
          message: "acknowledged by avery.lin",
          actor: "avery.lin",
          createdAt: ackAt,
        },
        {
          incidentId: incident.id,
          kind: "resolved",
          message: "resolved — upstream recovered, alert cleared",
          actor: "avery.lin",
          createdAt: resolvedAt,
        },
      ]);
    } else if (index % 3 === 1) {
      const ackAt = new Date(incident.firstSeenAt.getTime() + (3 + (index % 9)) * 60_000);
      await db
        .update(incidents)
        .set({ status: "acknowledged", acknowledgedAt: ackAt, assignee: "jordan.ok" })
        .where(eq(incidents.id, incident.id));
      await db.insert(incidentTimeline).values({
        incidentId: incident.id,
        kind: "acknowledged",
        message: "acknowledged by jordan.ok — investigating upstream dependency",
        actor: "jordan.ok",
        createdAt: ackAt,
      });
    }
  }
}

let seedPromise: Promise<void> | null = null;

/** Idempotent bootstrap: sources, operator, and one backfilled day of traffic. */
export async function ensureSeed(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    try {
      await ensureSources();
      await ensureOperators();
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(webhookEvents);
      if (Number(row?.count ?? 0) === 0) {
        await generateTraffic(84, 26, 20260214);
        await ageIncidents();
      }
    } catch (err) {
      console.warn("[Seed] DB unavailable or uninitialized, skipping bootstrap:", (err as any)?.message || err);
    }
  })();
  try {
    await seedPromise;
  } catch (error) {
    seedPromise = null;
  }
}
