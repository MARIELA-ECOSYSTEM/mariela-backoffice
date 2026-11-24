import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { configuracoesApi } from "@/services/api/configuracoes.api";
import type {
  DadosLoja,
  ListaConfiguravel,
  SalvarMensagemPadraoWhatsapp,
} from "@/types/configuracoes";

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

/** Fase 22.8.9.10.7.3 — mensagens padrão de WhatsApp. */
export function useSalvarMensagemPadrao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { id: string | null; payload: SalvarMensagemPadraoWhatsapp }) =>
      vars.id === null
        ? configuracoesApi.criarMensagemPadrao(vars.payload)
        : configuracoesApi.atualizarMensagemPadrao(vars.id, vars.payload),
    onSuccess: () => void invalidar(),
  });
}

export function useExcluirMensagemPadrao() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: string) => configuracoesApi.excluirMensagemPadrao(id),
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
