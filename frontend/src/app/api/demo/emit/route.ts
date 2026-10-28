import { ingest, sign } from "@/lib/pipeline";
import { DEMO_SOURCES, ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

type Body = {
  scenario?: string;
  tamper?: boolean;
  replayKey?: string;
};

const SCENARIOS: Record<
  string,
  { slug: string; label: string; payload: () => Record<string, unknown> }
> = {
  latency: {
    slug: "prometheus-prod",
    label: "Prometheus · checkout latency",
    payload: () => ({
      event: "alert.firing",
      service: "checkout-api",
      severity: "warning",
      annotations: { summary: "p99 latency above 850ms on checkout-api" },
      value: 820 + Math.floor(Math.random() * 400),
    }),
  },
  saturation: {
    slug: "prometheus-prod",
    label: "Prometheus · worker saturation",
    payload: () => ({
      event: "alert.firing",
      service: "payments-worker",
      severity: "critical",
      annotations: { summary: "Celery queue depth exceeded 5k tasks" },
      value: 5000 + Math.floor(Math.random() * 3000),
    }),
  },
  edge: {
    slug: "cloudwatch-edge",
    label: "CloudWatch · edge 5xx alarm",
    payload: () => ({
      event: "alarm.state_change",
      service: "edge-gateway",
      severity: "critical",
      title: "5xx rate breached 2% on edge-gateway",
      region: "us-east-1",
    }),
  },
  deploy: {
    slug: "github-deploys",
    label: "GitHub · deploy failed",
    payload: () => ({
      event: "workflow_run.completed",
      service: "signalbridge-api",
      severity: "critical",
      conclusion: "failure",
      repository: { name: "signalbridge-api" },
      title: "Deploy pipeline failed on signalbridge-api",
    }),
  },
};

export async function POST(request: Request) {
  await ensureSeed();
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const scenario = SCENARIOS[body.scenario ?? "latency"] ?? SCENARIOS.latency;
  const source = DEMO_SOURCES.find((s) => s.slug === scenario.slug)!;
  const idempotencyKey = body.replayKey ?? `demo_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const raw = JSON.stringify({
    ...scenario.payload(),
    id: `evt_demo_${Date.now()}`,
    ts: new Date().toISOString(),
  });

  const signature = body.tamper ? sign(raw, "whsec_wrong_key") : sign(raw, source.secret);
  const result = await ingest({ slug: scenario.slug, rawBody: raw, signature, idempotencyKey });

  return Response.json(
    {
      label: scenario.label,
      source: source.name,
      request: {
        method: "POST",
        url: `/api/v1/webhooks/${scenario.slug}`,
        signature: `${signature.slice(0, 26)}…`,
        idempotencyKey,
        body: JSON.parse(raw) as unknown,
      },
      result: {
        accepted: result.ok,
        duplicate: result.duplicate,
        httpStatus: result.httpStatus,
        incident: result.incidentRef ?? null,
        correlated: result.correlated,
        severity: result.severity,
        escalationLevel: result.escalationLevel ?? null,
        archiveKey: result.archiveKey ?? null,
        processingMs: result.processingMs,
        error: result.error ?? null,
      },
      pipeline: result.trace,
      idempotencyKey,
    },
    { status: 200 },
  );
}
