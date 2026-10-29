import type { ReactNode } from "react";
import Shell from "@/components/ops/Shell";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Shell>
      {children}
    </Shell>
  );
}
