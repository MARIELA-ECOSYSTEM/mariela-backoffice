import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { configuracoesApi } from "@/services/api/configuracoes.api";
import type { DadosLoja, ListaConfiguravel } from "@/types/configuracoes";

export const configuracoesKeys = { todos: ["configuracoes"] as const };

export function useConfiguracoes() {
  return useQuery({
    queryKey: configuracoesKeys.todos,
    queryFn: () => configuracoesApi.obter(),
    staleTime: 60_000,
  });
}

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: configuracoesKeys.todos });
}

export function useAtualizarLoja() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: DadosLoja) => configuracoesApi.atualizarLoja(payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAdicionarItemLista() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { lista: ListaConfiguravel; valor: string }) =>
      configuracoesApi.adicionarItem(vars.lista, vars.valor),
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverItemLista() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { lista: ListaConfiguravel; valor: string }) =>
      configuracoesApi.removerItem(vars.lista, vars.valor),
    onSuccess: () => void invalidar(),
  });
}
