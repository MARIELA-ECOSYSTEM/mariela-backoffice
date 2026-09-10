import { IndicadorCor } from "@/components/common/indicador-cor";
import type { EstoqueCorResumo } from "@/types/estoque";

/**
 * Distribuição do estoque: cada cor (variante) com seus tamanhos e quantidades.
 * Hierarquia: cor em destaque discreto, tamanhos como chips "TAM · qtd".
 * Complementa (não repete) a quantidade total já exibida na listagem.
 */
export function CoresTamanhos({ cores }: { cores: EstoqueCorResumo[] }) {
  if (!cores.length) {
    return <span className="text-xs text-muted-foreground">Nenhuma cor cadastrada.</span>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {cores.map((cor) => {
        const tamanhos = cor.tamanhos.filter((tamanho) => tamanho.quantidade > 0);
        return (
          <li
            key={cor.varianteId}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-tight"
          >
            <IndicadorCor cor={cor.cor} />
            <span className="shrink-0 font-medium text-foreground">{cor.cor}</span>
            {tamanhos.length ? (
              tamanhos.map((tamanho) => (
                <span
                  key={tamanho.tamanho}
                  className="rounded border border-border bg-surface px-1 py-px tabular-nums text-muted-foreground"
                >
                  {tamanho.tamanho}
                  <span aria-hidden> · </span>
                  <span className="font-medium text-foreground">{tamanho.quantidade}</span>
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">sem estoque</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
