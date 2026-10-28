import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

export default function ActionLink({
  href,
  children,
  tone = "dark",
  className = "",
  small = false,
  arrow = true,
}: {
  href: string;
  children: ReactNode;
  tone?: "dark" | "light" | "ghost";
  className?: string;
  small?: boolean;
  arrow?: boolean;
}) {
  return (
    <Link href={href} className={`sb-action sb-action-${tone} ${small ? "sb-action-sm" : ""} ${className}`}>
      <span className="sb-action-label">{children}</span>
      {arrow && <span className="sb-action-disc"><ArrowUpRight size={15} strokeWidth={1.8} /></span>}
    </Link>
  );
}
