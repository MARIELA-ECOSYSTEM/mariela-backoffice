import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { caixasApi } from "@/services/api/caixas.api";
import { vendasKeys } from "@/hooks/use-vendas";
import type {
  AberturaCaixaPayload,
  EntradaCaixaPayload,
  FechamentoCaixaPayload,
  SaidaCaixaPayload,
} from "@/types/caixa";

export const caixasKeys = {
  todos: ["caixas"] as const,
  atual: ["caixas", "atual"] as const,
  estatisticas: ["caixas", "estatisticas"] as const,
  detalhe: (id: string) => ["caixas", "detalhe", id] as const,
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

export function useCaixas() {
  return useQuery({
    queryKey: caixasKeys.todos,
    queryFn: () => caixasApi.listar(),
    staleTime: 30_000,
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
