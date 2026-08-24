import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vendedoresApi } from "@/services/api/vendedores.api";
import type { VendedorPayload } from "@/types/vendedor";

export const vendedoresKeys = { todos: ["vendedores"] as const };

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: vendedoresKeys.todos });
}

export function useVendedores() {
  return useQuery({
    queryKey: vendedoresKeys.todos,
    queryFn: () => vendedoresApi.listar(),
    staleTime: 60_000,
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
