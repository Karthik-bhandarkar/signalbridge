import { getIncidents } from "@/lib/metrics";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureSeed();
  const url = new URL(request.url);
  const rows = await getIncidents({
    status: url.searchParams.get("status") ?? "all",
    severity: url.searchParams.get("severity") ?? "all",
    limit: Number(url.searchParams.get("limit") ?? 40),
  });
  return Response.json({ count: rows.length, incidents: rows });
}
