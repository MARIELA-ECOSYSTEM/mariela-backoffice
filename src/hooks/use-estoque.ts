import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { estoqueApi } from "@/services/api/estoque.api";
import { produtosKeys } from "./use-produtos";
import { dashboardKeys } from "./use-dashboard";
import type { EntradaEstoqueRequest, SaidaEstoqueRequest } from "@/types/estoque";
import type { FiltroDisponibilidade } from "@/types/produto";

export const estoqueKeys = {
  todos: ["estoque"] as const,
  lista: (filtros: {
    busca?: string | undefined;
    disponibilidade?: FiltroDisponibilidade | undefined;
  }) => ["estoque", "lista", filtros] as const,
};

export function useEstoque(filtros: {
  busca?: string | undefined;
  disponibilidade?: FiltroDisponibilidade | undefined;
}) {
  return useQuery({
    queryKey: estoqueKeys.lista(filtros),
    queryFn: () => estoqueApi.listar(filtros),
  });
}

function useInvalidarEstoque() {
  const queryClient = useQueryClient();
  return (produtoId?: string) => {
    void queryClient.invalidateQueries({ queryKey: estoqueKeys.todos });
    void queryClient.invalidateQueries({ queryKey: produtosKeys.todos });
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.todos });
    if (produtoId)
      void queryClient.invalidateQueries({ queryKey: produtosKeys.detalhe(produtoId) });
  };
}

export function useEntradaEstoque() {
  const invalidar = useInvalidarEstoque();
  return useMutation({
    mutationFn: (payload: EntradaEstoqueRequest) => estoqueApi.entrada(payload),
    onSuccess: (_produto, vars) => invalidar(vars.produtoId),
  });
}

export function useSaidaEstoque() {
  const invalidar = useInvalidarEstoque();
  return useMutation({
    mutationFn: (payload: SaidaEstoqueRequest) => estoqueApi.saida(payload),
    onSuccess: (_produto, vars) => invalidar(vars.produtoId),
  });
}
