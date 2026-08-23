import { cn } from "@/lib/utils";
import { corVisual } from "@/utils/cores";

/**
 * Indicador visual (bolinha) da cor cadastrada. Única implementação usada em
 * Produtos e Estoque — o texto original da cor nunca é alterado.
 */
export function IndicadorCor({ cor, className }: { cor: string; className?: string }) {
  return (
    <span
      aria-hidden
      title={cor}
      className={cn(
        "size-2.5 shrink-0 rounded-full border border-border shadow-[inset_0_0_0_1px_hsl(0_0%_100%/0.35)]",
        className,
      )}
      style={{ backgroundColor: corVisual(cor) }}
    />
  );
}
