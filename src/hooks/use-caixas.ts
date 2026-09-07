import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { caixasApi } from "@/services/api/caixas.api";
import { vendasKeys } from "@/hooks/use-vendas";
import type {
  AberturaCaixaPayload,
  CaixaFiltros,
  EntradaCaixaPayload,
  FechamentoCaixaPayload,
  MovimentosCaixaFiltros,
  SaidaCaixaPayload,
} from "@/types/caixa";

export const caixasKeys = {
  todos: ["caixas"] as const,
  lista: (filtros: CaixaFiltros) => [...caixasKeys.todos, "lista", filtros] as const,
  atual: ["caixas", "atual"] as const,
  estatisticas: ["caixas", "estatisticas"] as const,
  detalhe: (id: string) => ["caixas", "detalhe", id] as const,
  movimentacoes: (id: string, filtros: MovimentosCaixaFiltros) =>
    ["caixas", "detalhe", id, "movimentacoes", filtros] as const,
};

/** Movimentações de caixa refletem em vendas (recebimentos/devoluções). */
function useInvalidar() {
  const queryClient = useQueryClient();
  return async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: caixasKeys.todos }),
      queryClient.invalidateQueries({ queryKey: vendasKeys.todas }),
      ...(id ? [queryClient.invalidateQueries({ queryKey: caixasKeys.detalhe(id) })] : []),
    ]);
  };
}

/**
 * Paginação/busca/facetas real, delegada ao backend — mesmo padrão de
 * `useClientes`/`useFornecedores`/`useVendedores`. Sem `staleTime`: uma
 * versão anterior deste hook cacheava por 30s antes de existir paginação;
 * mantê-lo serviria dados obsoletos ao voltar para uma página já visitada
 * (mesmo bug já corrigido nos módulos acima).
 */
export function useCaixas(filtros: CaixaFiltros = {}) {
  return useQuery({
    queryKey: caixasKeys.lista(filtros),
    queryFn: () => caixasApi.listar(filtros),
    placeholderData: keepPreviousData,
  });
}

export function useCaixaAtual() {
  return useQuery({
    queryKey: caixasKeys.atual,
    queryFn: () => caixasApi.atual(),
    staleTime: 15_000,
  });
}

export function useEstatisticasCaixa() {
  return useQuery({
    queryKey: caixasKeys.estatisticas,
    queryFn: () => caixasApi.estatisticas(),
    staleTime: 15_000,
  });
}

export function useCaixa(id: string) {
  return useQuery({
    queryKey: caixasKeys.detalhe(id),
    queryFn: () => caixasApi.obter(id),
    enabled: Boolean(id),
  });
}

/** Histórico paginado de movimentações — substitui o array embutido (não limitado) do detalhe. */
export function useMovimentacoesDoCaixa(id: string, filtros: MovimentosCaixaFiltros = {}) {
  return useQuery({
    queryKey: caixasKeys.movimentacoes(id, filtros),
    queryFn: () => caixasApi.movimentacoes(id, filtros),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useAbrirCaixa() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: AberturaCaixaPayload) => caixasApi.abrir(payload),
    onSuccess: () => void invalidar(),
  });
}

export function useEntradaCaixa(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: EntradaCaixaPayload) => caixasApi.entrada(id, payload),
    onSuccess: () => void invalidar(id),
  });
}

export function useSaidaCaixa(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: SaidaCaixaPayload) => caixasApi.saida(id, payload),
    onSuccess: () => void invalidar(id),
  });
}

export function useFecharCaixa(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: FechamentoCaixaPayload) => caixasApi.fechar(id, payload),
    onSuccess: () => void invalidar(id),
  });
}
