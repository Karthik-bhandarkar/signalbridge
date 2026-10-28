import { getHourlyVolume, getLandingMetrics, getStageMix } from "@/lib/metrics";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const [metrics, hourly, stages] = await Promise.all([
    getLandingMetrics(),
    getHourlyVolume(24),
    getStageMix(),
  ]);
  return Response.json({ metrics, hourly, stages, generatedAt: new Date().toISOString() });
}
