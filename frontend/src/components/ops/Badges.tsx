import { Badge, type BadgeTone } from "@/components/ui/controls";

const SEVERITY_TONE: Record<string, BadgeTone> = {
  critical: "critical",
  warning: "warning",
  info: "info",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  open: "danger",
  acknowledged: "warning",
  resolved: "success",
  processed: "success",
  duplicate: "warning",
  rejected: "danger",
  failed: "danger",
};

export function SeverityBadge({ value }: { value: string }) {
  return <Badge tone={SEVERITY_TONE[value] ?? "neutral"}>{value}</Badge>;
}

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={STATUS_TONE[value] ?? "neutral"}>{value}</Badge>;
}

export function LevelPill({ level }: { level: number }) {
  const tone: BadgeTone = level >= 3 ? "danger" : level === 2 ? "warning" : "info";
  return (
    <Badge tone={tone} dot={false} className="font-mono-sb">
      L{level}
    </Badge>
  );
}
