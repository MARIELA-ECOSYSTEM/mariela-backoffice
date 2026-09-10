import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vendasApi } from "@/services/api/vendas.api";
import { clientesKeys, fornecedoresKeys } from "@/hooks/use-cadastros";
import { vendedoresKeys } from "@/hooks/use-vendedores";
import { produtosKeys } from "@/hooks/use-produtos";
import type {
  BaixaParcelaPayload,
  CancelamentoPayload,
  RegistrarRecebimentoPayload,
} from "@/types/venda";

export const vendasKeys = {
  todas: ["vendas"] as const,
  estatisticas: ["vendas", "estatisticas"] as const,
  detalhe: (id: string) => ["vendas", "detalhe", id] as const,
};

/** Vendas afetam estoque e agregados de clientes/vendedores/fornecedores. */
function useInvalidar() {
  const queryClient = useQueryClient();
  return async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: vendasKeys.todas }),
      queryClient.invalidateQueries({ queryKey: produtosKeys.todos }),
      queryClient.invalidateQueries({ queryKey: clientesKeys.todos }),
      queryClient.invalidateQueries({ queryKey: fornecedoresKeys.todos }),
      queryClient.invalidateQueries({ queryKey: vendedoresKeys.todos }),
      ...(id ? [queryClient.invalidateQueries({ queryKey: vendasKeys.detalhe(id) })] : []),
    ]);
  };
}

export function useVendas() {
  return useQuery({
    queryKey: vendasKeys.todas,
    queryFn: () => vendasApi.listar(),
    staleTime: 30_000,
  });
}

export function useEstatisticasVendas() {
  return useQuery({
    queryKey: vendasKeys.estatisticas,
    queryFn: () => vendasApi.estatisticas(),
    staleTime: 30_000,
  });
}

export function useVenda(id: string) {
  return useQuery({
    queryKey: vendasKeys.detalhe(id),
    queryFn: () => vendasApi.obter(id),
    enabled: Boolean(id),
  });
}

export function useBaixarParcela(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { parcelaId: string; payload: BaixaParcelaPayload }) =>
      vendasApi.baixarParcela(id, vars.parcelaId, vars.payload),
    onSuccess: () => void invalidar(id),
  });
}

export function useReceberPagamento(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: RegistrarRecebimentoPayload) => vendasApi.receberPagamento(id, payload),
    onSuccess: () => void invalidar(id),
  });
}

export function useCancelarVenda(id: string) {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: CancelamentoPayload) => vendasApi.cancelar(id, payload),
    onSuccess: () => void invalidar(id),
  });
}
