import { cn } from "@/lib/utils";

/**
 * Exibição padrão dos códigos das entidades (`PROD-0001`, `CLI-0002`…).
 * Reutilizável em Produtos, Clientes, Fornecedores, Vendedores, Coleções,
 * Campanhas, Vendas e Caixa.
 */
export function CodigoBadge({
  codigo,
  className,
  tamanho = "sm",
}: {
  codigo: string | null | undefined;
  className?: string;
  tamanho?: "xs" | "sm";
}) {
  if (!codigo) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md border border-primary/20 bg-primary-soft/60 font-mono uppercase tracking-[0.08em] text-primary",
        tamanho === "xs" ? "px-1.5 py-0.5 text-[0.7rem]" : "px-2 py-0.5 text-[0.75rem]",
        className,
      )}
      title={codigo}
    >
      {codigo}
    </span>
  );
}
