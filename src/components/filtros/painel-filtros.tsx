import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterDropdown } from "@/components/filtros/filter-dropdown";
import type { GrupoFacetaRenderizavel } from "@/lib/filtros/facetas";

/**
 * Barra padrão de filtros do backoffice: botões compactos que abrem
 * dropdown/combobox com múltipla seleção e contagem dinâmica.
 */
export function PainelFiltros({
  grupos,
  totalSelecionados,
  onAlternar,
  onLimparGrupo,
  onLimparTudo,
  cabecalho,
  resultado,
}: {
  grupos: GrupoFacetaRenderizavel[];
  totalSelecionados: number;
  onAlternar: (grupoId: string, valor: string) => void;
  onLimparGrupo: (grupoId: string) => void;
  onLimparTudo: () => void;
  /** Mantido por compatibilidade: a barra agora é fluida. */
  colunas?: 2 | 3 | 4;
  /** Conteúdo extra no topo (busca principal, ordenação…). */
  cabecalho?: ReactNode;
  /** Total de resultados da pesquisa — distinto das contagens das opções. */
  resultado?: ReactNode;
}) {
  return (
    <Card className="mb-6 border-border bg-surface/60">
      <CardContent className="space-y-4 py-5">
        {cabecalho}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border/70 pt-4">
          <span className="flex items-center gap-2 font-brand text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
            <SlidersHorizontal aria-hidden className="size-3.5 text-primary" />
            Filtros
            {totalSelecionados > 0 ? (
              <Badge variant="outline">{totalSelecionados}</Badge>
            ) : null}
          </span>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {grupos.map((grupo) => (
              <FilterDropdown
                key={grupo.id}
                grupo={grupo}
                onAlternar={onAlternar}
                onLimpar={onLimparGrupo}
              />
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {resultado}
            {totalSelecionados > 0 ? (
              <Button variant="ghost" size="sm" onClick={onLimparTudo}>
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
