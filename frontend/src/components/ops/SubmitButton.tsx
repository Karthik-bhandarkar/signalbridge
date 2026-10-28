"use client";

import { Plus } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/controls";

export default function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "",
  showPlus = false,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  showPlus?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="sm"
      loading={pending}
      leadingIcon={showPlus ? <Plus size={13} aria-hidden="true" /> : undefined}
      className={className}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
