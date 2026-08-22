import { Badge } from "@/components/ui/badge";
import { LABEL_STATUS, statusEstoque } from "@/utils/produto";

export function StatusEstoqueBadge({ quantidadeTotal }: { quantidadeTotal: number }) {
  const status = statusEstoque(quantidadeTotal);
  const classes: Record<typeof status, string> = {
    disponivel: "border-success/30 bg-success/10 text-success",
    baixo: "border-warning/40 bg-warning/15 text-warning-foreground",
    "sem-estoque": "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return (
    <Badge variant="outline" className={classes[status]}>
      {LABEL_STATUS[status]}
    </Badge>
  );
}

export function TagBadge({ children, tom }: { children: string; tom: "gold" | "primary" }) {
  const classes =
    tom === "gold"
      ? "border-gold/40 bg-gold/15 text-gold-foreground"
      : "border-primary/25 bg-primary/10 text-primary";
  return (
    <Badge variant="outline" className={classes}>
      {children}
    </Badge>
  );
}
