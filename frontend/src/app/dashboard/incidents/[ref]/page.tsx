import IncidentDetailClient from "./IncidentDetailClient";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <IncidentDetailClient refParam={ref} />;
}
