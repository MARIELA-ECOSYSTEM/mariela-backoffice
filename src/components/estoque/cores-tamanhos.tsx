import { IndicadorCor } from "@/components/common/indicador-cor";
import type { EstoqueCorResumo } from "@/types/estoque";

/**
 * Distribuição do estoque: cada cor disponível com seus tamanhos e quantidades.
 * Complementa (não repete) a quantidade total já exibida na listagem.
 */
export function CoresTamanhos({ cores }: { cores: EstoqueCorResumo[] }) {
  if (!cores.length) {
    return <span className="text-xs text-muted-foreground">Nenhuma cor cadastrada.</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {cores.map((cor) => {
        const tamanhos = cor.tamanhos.filter((tamanho) => tamanho.quantidade > 0);
        return (
          <div key={cor.varianteId} className="flex items-baseline gap-1.5 text-xs leading-tight">
            <IndicadorCor cor={cor.cor} className="mt-1" />
            <span className="shrink-0 font-medium text-foreground">{cor.cor}</span>
            <span className="tabular-nums text-muted-foreground">
              {tamanhos.length
                ? tamanhos.map((t) => `${t.tamanho}(${t.quantidade})`).join(" ")
                : "sem estoque"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
