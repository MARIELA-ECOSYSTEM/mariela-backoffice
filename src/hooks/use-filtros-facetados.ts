import { useCallback, useMemo, useState } from "react";
import {
  alternarValor,
  aplicarFacetas,
  calcularFacetas,
  contarSelecionados,
  selecaoVazia,
  temSelecaoAtiva,
  type FacetasExternas,
  type GrupoFacetaDef,
  type GrupoFacetaRenderizavel,
  type SelecaoFacetas,
} from "@/lib/filtros/facetas";

export interface UseFiltrosFacetados<T> {
  selecao: SelecaoFacetas;
  grupos: GrupoFacetaRenderizavel[];
  itensFiltrados: T[];
  totalSelecionados: number;
  temSelecao: boolean;
  alternar: (grupoId: string, valor: string) => void;
  limparGrupo: (grupoId: string) => void;
  limparTudo: () => void;
}

/**
 * Hook oficial de filtros com contagem. Hoje calcula os counts a partir dos
 * dados carregados; quando a API NestJS enviar `facets`, basta repassá-los em
 * `facetasExternas` — a UI e o contrato do componente não mudam.
 */
export function useFiltrosFacetados<T>({
  itens,
  grupos,
  facetasExternas,
}: {
  itens: T[];
  grupos: GrupoFacetaDef<T>[];
  facetasExternas?: FacetasExternas | undefined;
}): UseFiltrosFacetados<T> {
  const [selecao, setSelecao] = useState<SelecaoFacetas>(() => selecaoVazia(grupos));

  const alternar = useCallback((grupoId: string, valor: string) => {
    setSelecao((atual) => alternarValor(atual, grupoId, valor));
  }, []);

  const limparGrupo = useCallback((grupoId: string) => {
    setSelecao((atual) => ({ ...atual, [grupoId]: [] }));
  }, []);

  const limparTudo = useCallback(() => {
    setSelecao(selecaoVazia(grupos));
  }, [grupos]);

  const itensFiltrados = useMemo(
    () => aplicarFacetas(itens, grupos, selecao),
    [itens, grupos, selecao],
  );

  const gruposRenderizaveis = useMemo(
    () => calcularFacetas(itens, grupos, selecao, facetasExternas),
    [itens, grupos, selecao, facetasExternas],
  );

  return {
    selecao,
    grupos: gruposRenderizaveis,
    itensFiltrados,
    totalSelecionados: contarSelecionados(selecao),
    temSelecao: temSelecaoAtiva(selecao),
    alternar,
    limparGrupo,
    limparTudo,
  };
}
