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
  selecao: selecaoControlada,
  onSelecaoChange,
}: {
  itens: T[];
  grupos: GrupoFacetaDef<T>[];
  facetasExternas?: FacetasExternas | undefined;
  /** Seleção controlada — use quando ela precisa ir para a query da API. */
  selecao?: SelecaoFacetas | undefined;
  onSelecaoChange?: ((selecao: SelecaoFacetas) => void) | undefined;
}): UseFiltrosFacetados<T> {
  const [selecaoInterna, setSelecaoInterna] = useState<SelecaoFacetas>(() => selecaoVazia(grupos));
  const controlado = selecaoControlada !== undefined;
  const selecao = controlado ? selecaoControlada : selecaoInterna;

  const setSelecao = useCallback(
    (atualizar: (atual: SelecaoFacetas) => SelecaoFacetas) => {
      if (controlado) onSelecaoChange?.(atualizar(selecaoControlada));
      else setSelecaoInterna(atualizar);
    },
    [controlado, onSelecaoChange, selecaoControlada],
  );

  const alternar = useCallback(
    (grupoId: string, valor: string) => {
      setSelecao((atual) => alternarValor(atual, grupoId, valor));
    },
    [setSelecao],
  );

  const limparGrupo = useCallback(
    (grupoId: string) => {
      setSelecao((atual) => ({ ...atual, [grupoId]: [] }));
    },
    [setSelecao],
  );

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
