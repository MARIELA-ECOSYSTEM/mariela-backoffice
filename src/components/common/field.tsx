import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  erro,
  hint,
  obrigatorio = false,
  children,
  className,
}: {
  id: string;
  label: string;
  erro?: string | undefined;
  hint?: string;
  /** Marca visual de campo obrigatório — não altera validação. */
  obrigatorio?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {obrigatorio ? (
          <>
            <span aria-hidden className="text-destructive">
              *
            </span>
            <span className="sr-only">(obrigatório)</span>
          </>
        ) : null}
      </Label>
      {children}
      {hint && !erro ? (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-xs font-medium text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
