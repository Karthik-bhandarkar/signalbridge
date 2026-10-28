import { getSession } from "@/lib/auth";
import IncidentsClientPage from "./IncidentsClientPage";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const session = await getSession();

  return <IncidentsClientPage initialUser={session} />;
}
