import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { produtosApi } from "@/services/api/produtos.api";
import type {
  FotoPrincipalRequest,
  NovidadeRequest,
  Produto,
  ProdutoFiltros,
  ProdutoPayload,
  PromocaoRequest,
} from "@/types/produto";

export const produtosKeys = {
  todos: ["produtos"] as const,
  lista: (filtros: ProdutoFiltros) => ["produtos", "lista", filtros] as const,
  detalhe: (id: string) => ["produtos", "detalhe", id] as const,
};

export function useProdutos(filtros: ProdutoFiltros) {
  return useQuery({
    queryKey: produtosKeys.lista(filtros),
    queryFn: () => produtosApi.listar(filtros),
  });
}

export function useProduto(id: string) {
  return useQuery({
    queryKey: produtosKeys.detalhe(id),
    queryFn: () => produtosApi.obter(id),
    enabled: Boolean(id),
  });
}

function useInvalidarProdutos() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: produtosKeys.todos });
    void queryClient.invalidateQueries({ queryKey: ["estoque"] });
    if (id) void queryClient.invalidateQueries({ queryKey: produtosKeys.detalhe(id) });
  };
}

export function useCriarProduto() {
  const invalidar = useInvalidarProdutos();
  return useMutation({
    mutationFn: (payload: ProdutoPayload) => produtosApi.criar(payload),
    onSuccess: (produto: Produto) => invalidar(produto.id),
  });
}

export function useAtualizarProduto(id: string) {
  const invalidar = useInvalidarProdutos();
  return useMutation({
    mutationFn: (payload: ProdutoPayload) => produtosApi.atualizar(id, payload),
    onSuccess: () => invalidar(id),
  });
}

export function useExcluirProduto() {
  const invalidar = useInvalidarProdutos();
  return useMutation({
    mutationFn: (id: string) => produtosApi.excluir(id),
    onSuccess: () => invalidar(),
  });
}

export function useDefinirPromocao(id: string) {
  const invalidar = useInvalidarProdutos();
  return useMutation({
    mutationFn: (payload: PromocaoRequest) => produtosApi.definirPromocao(id, payload),
    onSuccess: () => invalidar(id),
  });
}

export function useDefinirNovidade(id: string) {
  const invalidar = useInvalidarProdutos();
  return useMutation({
    mutationFn: (payload: NovidadeRequest) => produtosApi.definirNovidade(id, payload),
    onSuccess: () => invalidar(id),
  });
}

export function useDefinirFotoPrincipal(id: string) {
  const invalidar = useInvalidarProdutos();
  return useMutation({
    mutationFn: (payload: FotoPrincipalRequest) => produtosApi.definirFotoPrincipal(id, payload),
    onSuccess: () => invalidar(id),
  });
}
