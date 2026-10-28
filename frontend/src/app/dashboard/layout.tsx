import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents } from "@/db/schema";
import Shell from "@/components/ops/Shell";
import { getSession } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  await ensureSeed();

  let openCount = 3;
  let criticalCount = 1;
  try {
    const [counts] = await db
      .select({
        open: sql<number>`count(*) filter (where ${incidents.status} in ('open','acknowledged'))::int`,
        critical: sql<number>`count(*) filter (where ${incidents.status} = 'open' and ${incidents.severity} = 'critical')::int`,
      })
      .from(incidents);
    openCount = Number(counts?.open ?? 0);
    criticalCount = Number(counts?.critical ?? 0);
  } catch (err) {
    console.warn("[DashboardLayout] DB offline, using fallback counts:", err);
  }

  return (
    <Shell
      user={session}
      openIncidents={openCount}
      critical={criticalCount}
    >
      {children}
    </Shell>
  );
}
