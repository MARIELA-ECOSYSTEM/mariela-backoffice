import { Badge } from "@/components/ui/badge";
import { LABEL_STATUS, statusEstoque } from "@/utils/produto";

export function StatusEstoqueBadge({ quantidadeTotal }: { quantidadeTotal: number }) {
  const status = statusEstoque(quantidadeTotal);
  const variantes: Record<typeof status, "success" | "warning" | "destructive"> = {
    disponivel: "success",
    baixo: "warning",
    "sem-estoque": "destructive",
  };
  return (
    <Badge variant={variantes[status]}>
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current opacity-70"
        data-status={status}
      />
      {LABEL_STATUS[status]}
    </Badge>
  );
}

export function TagBadge({ children, tom }: { children: string; tom: "gold" | "primary" }) {
  if (tom === "gold") {
    return <Badge variant="gold">{children}</Badge>;
  }
  return (
    <Badge variant="outline" className="border-primary/30 bg-primary-soft/50 text-primary">
      {children}
    </Badge>
  );
}
