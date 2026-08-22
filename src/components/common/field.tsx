import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function Field({
  id,
  label,
  erro,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  erro?: string | undefined;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !erro ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {erro ? (
        <p id={`${id}-erro`} className="text-xs text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
