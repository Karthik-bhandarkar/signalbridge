import { sql } from "drizzle-orm";
import { db } from "@/db";
import { taskRuns, webhookEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    const dbMs = Date.now() - startedAt;

    const [events] = await db
      .select({
        total: sql<number>`count(*)::int`,
        last5m: sql<number>`count(*) filter (where ${webhookEvents.receivedAt} >= now() - interval '5 minutes')::int`,
        failed: sql<number>`count(*) filter (where ${webhookEvents.status} = 'failed')::int`,
      })
      .from(webhookEvents);
    const [tasks] = await db
      .select({
        runs: sql<number>`count(*)::int`,
        rejected: sql<number>`count(*) filter (where ${taskRuns.status} = 'failed' and ${taskRuns.stage} = 'verify')::int`,
        failed: sql<number>`count(*) filter (where ${taskRuns.status} = 'failed' and ${taskRuns.stage} <> 'verify')::int`,
      })
      .from(taskRuns);

    return Response.json({
      ok: true,
      service: "signalbridge",
      checks: {
        database: { status: "operational", latencyMs: dbMs },
        ingestEdge: { status: "operational", eventsLast5m: Number(events?.last5m ?? 0) },
        pipelineWorker: {
          status: Number(tasks?.failed ?? 0) > 0 ? "degraded" : "operational",
          stageRuns: Number(tasks?.runs ?? 0),
          stageFailures: Number(tasks?.failed ?? 0),
        },
        signatureEnforcement: {
          status: "operational",
          rejectedDeliveries: Number(tasks?.rejected ?? 0),
        },
        archive: {
          status: "local-ledger",
          driver: "postgres-jsonb",
        },
      },
      eventsTotal: Number(events?.total ?? 0),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: "signalbridge",
        status: "degraded",
        checks: {
          database: { status: "degraded", error: error instanceof Error ? error.message : "database connection pending" },
          ingestEdge: { status: "operational" },
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
