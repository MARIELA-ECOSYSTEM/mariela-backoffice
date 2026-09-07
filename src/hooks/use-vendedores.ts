import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vendedoresApi } from "@/services/api/vendedores.api";
import type { VendedorFiltros, VendedorPayload } from "@/types/vendedor";

export const vendedoresKeys = {
  todos: ["vendedores"] as const,
  lista: (filtros: VendedorFiltros) => [...vendedoresKeys.todos, "lista", filtros] as const,
  detalhe: (id: string) => [...vendedoresKeys.todos, id] as const,
};

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: vendedoresKeys.todos });
}

/**
 * Paginação/busca/facetas real, delegada ao backend — mesmo padrão de
 * `useClientes`/`useFornecedores`/`useColecoes`/`useCampanhas`. Sem
 * `staleTime`: uma versão anterior deste hook usava cache de 60s antes de
 * existir paginação; ao adicioná-la, o cache antigo servia dados obsoletos ao
 * voltar para uma página já visitada (mesmo bug já corrigido nos módulos acima).
 */
export function useVendedores(filtros: VendedorFiltros = {}) {
  return useQuery({
    queryKey: vendedoresKeys.lista(filtros),
    queryFn: () => vendedoresApi.listar(filtros),
    placeholderData: keepPreviousData,
  });
}

export function useVendedor(id: string | null) {
  return useQuery({
    queryKey: vendedoresKeys.detalhe(id ?? ""),
    queryFn: () => vendedoresApi.obter(id!),
    enabled: Boolean(id),
  });
}

/** Histórico de vendas do vendedor (somente leitura). */
export function useVendasDoVendedor(id: string | null) {
  return useQuery({
    queryKey: [...vendedoresKeys.todos, id, "vendas"],
    queryFn: () => vendedoresApi.listarVendas(id!),
    enabled: Boolean(id),
  });
}

export function useCriarVendedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: VendedorPayload) => vendedoresApi.criar(payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAtualizarVendedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { id: string; payload: VendedorPayload }) =>
      vendedoresApi.atualizar(vars.id, vars.payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAlterarStatusVendedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { id: string; ativo: boolean }) =>
      vendedoresApi.alterarStatus(vars.id, { ativo: vars.ativo }),
    onSuccess: () => void invalidar(),
  });
}

export function useRedefinirSenhaVendedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { id: string; senha: string }) =>
      vendedoresApi.redefinirSenha(vars.id, { senha: vars.senha }),
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverVendedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: string) => vendedoresApi.remover(id),
    onSuccess: () => void invalidar(),
  });
}
