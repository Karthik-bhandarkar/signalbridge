import { getSession } from "@/lib/auth";
import LiveDashboard from "./LiveDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <LiveDashboard initialUser={session} />
  );
}
