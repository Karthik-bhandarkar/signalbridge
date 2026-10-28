import { IDEMPOTENCY_HEADER, SIGNATURE_HEADER, ingest } from "@/lib/pipeline";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  await ensureSeed();

  const rawBody = await request.text();
  const result = await ingest({
    slug,
    rawBody,
    signature: request.headers.get(SIGNATURE_HEADER),
    idempotencyKey: request.headers.get(IDEMPOTENCY_HEADER),
  });

  return Response.json(
    {
      accepted: result.ok,
      duplicate: result.duplicate,
      event_id: result.eventId ?? null,
      incident: result.incidentRef ?? null,
      correlated: result.correlated,
      severity: result.severity,
      escalation_level: result.escalationLevel ?? null,
      archive_key: result.archiveKey ?? null,
      processing_ms: result.processingMs,
      pipeline: result.trace,
      error: result.error,
    },
    { status: result.httpStatus },
  );
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  return Response.json({
    endpoint: `/api/v1/webhooks/${slug}`,
    method: "POST",
    headers: {
      [SIGNATURE_HEADER]: "sha256=<hex hmac of the raw body>",
      [IDEMPOTENCY_HEADER]: "optional; defaults to sha256(slug + body)",
      "content-type": "application/json",
    },
    responses: { 202: "accepted", 200: "duplicate replay", 401: "signature mismatch", 404: "unknown source" },
  });
}
