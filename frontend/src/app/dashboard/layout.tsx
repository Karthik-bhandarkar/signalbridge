import type { ReactNode } from "react";
import Shell from "@/components/ops/Shell";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <Shell
      user={session}
      openIncidents={0}
      critical={0}
    >
      {children}
    </Shell>
  );
}
