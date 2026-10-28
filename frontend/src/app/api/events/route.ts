import { getRecentEvents } from "@/lib/metrics";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureSeed();
  const url = new URL(request.url);
  const rows = await getRecentEvents(Math.min(100, Number(url.searchParams.get("limit") ?? 25)), {
    severity: url.searchParams.get("severity") ?? "all",
    status: url.searchParams.get("status") ?? "all",
  });
  return Response.json({
    count: rows.length,
    events: rows.map((event) => ({
      id: event.id,
      source: event.sourceSlug,
      type: event.eventType,
      service: event.service,
      severity: event.severity,
      status: event.status,
      signature_valid: event.signatureValid,
      fingerprint: event.fingerprint,
      incident_id: event.incidentId,
      archive_key: event.archiveKey,
      processing_ms: event.processingMs,
      received_at: event.receivedAt,
    })),
  });
}
