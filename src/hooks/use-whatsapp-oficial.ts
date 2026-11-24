import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappOficialApi } from "@/services/api/whatsapp-oficial.api";
import type {
  FiltrosBloqueiosWhatsapp,
  FiltrosMensagensWhatsapp,
  LiberarReenvioPayload,
} from "@/types/whatsapp-oficial";

/**
 * Fase 22.8.9.10.6 — hooks do fluxo OFICIAL de WhatsApp. Nenhum `retry` automático em mutações (padrão do React
 * Query) e nenhuma mutação de envio aqui: o envio passa por `enviarIntencao` (`envio-oficial.ts`), que controla a chave
 * de idempotência e o registro local.
 */
export const whatsappOficialKeys = {
  todos: ["whatsapp-oficial"] as const,
  templates: ["whatsapp-oficial", "templates"] as const,
  mensagens: ["whatsapp-oficial", "mensagens"] as const,
  listaMensagens: (f: FiltrosMensagensWhatsapp) =>
    ["whatsapp-oficial", "mensagens", "lista", f] as const,
  mensagem: (id: string) => ["whatsapp-oficial", "mensagens", "item", id] as const,
  bloqueios: ["whatsapp-oficial", "bloqueios"] as const,
  listaBloqueios: (f: FiltrosBloqueiosWhatsapp) =>
    ["whatsapp-oficial", "bloqueios", "lista", f] as const,
  bloqueioCliente: (clienteId: string) =>
    ["whatsapp-oficial", "bloqueios", "cliente", clienteId] as const,
};

export function useTemplatesWhatsapp(opcoes: { habilitado?: boolean } = {}) {
  return useQuery({
    queryKey: whatsappOficialKeys.templates,
    queryFn: () => whatsappOficialApi.listarTemplates(),
    enabled: opcoes.habilitado ?? true,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Prévia com os dados reais do cliente — o backend aplica a MESMA regra de parâmetros do envio. */
export function usePreviaTemplateWhatsapp(chave: string | null, clienteId: string | null) {
  return useQuery({
    queryKey: ["whatsapp-oficial", "previa", chave, clienteId] as const,
    queryFn: () => whatsappOficialApi.previa(chave ?? "", clienteId ?? ""),
    enabled: chave !== null && clienteId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useMensagensWhatsapp(
  filtros: FiltrosMensagensWhatsapp,
  opcoes: { habilitado?: boolean } = {},
) {
  return useQuery({
    queryKey: whatsappOficialKeys.listaMensagens(filtros),
    queryFn: () => whatsappOficialApi.listarMensagens(filtros),
    enabled: opcoes.habilitado ?? true,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useMensagemWhatsapp(id: string | null) {
  return useQuery({
    queryKey: whatsappOficialKeys.mensagem(id ?? ""),
    queryFn: () => whatsappOficialApi.obterMensagem(id ?? ""),
    enabled: id !== null,
    refetchOnWindowFocus: false,
  });
}

export function useLiberarReenvioWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LiberarReenvioPayload }) =>
      whatsappOficialApi.liberarReenvio(id, payload),
    onSuccess: (mensagem) => {
      queryClient.setQueryData(whatsappOficialKeys.mensagem(mensagem.id), mensagem);
      void queryClient.invalidateQueries({ queryKey: whatsappOficialKeys.mensagens });
    },
  });
}

export function useBloqueioClienteWhatsapp(clienteId: string | null) {
  return useQuery({
    queryKey: whatsappOficialKeys.bloqueioCliente(clienteId ?? ""),
    queryFn: () => whatsappOficialApi.statusBloqueioCliente(clienteId ?? ""),
    enabled: clienteId !== null,
    refetchOnWindowFocus: false,
  });
}

export function useBloquearClienteWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, motivo }: { clienteId: string; motivo: string | null }) =>
      whatsappOficialApi.bloquearCliente(clienteId, motivo),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: whatsappOficialKeys.bloqueios }),
  });
}

export function useDesbloquearClienteWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, motivo }: { clienteId: string; motivo: string }) =>
      whatsappOficialApi.desbloquearCliente(clienteId, motivo),
    onSuccess: (status, { clienteId }) => {
      queryClient.setQueryData(whatsappOficialKeys.bloqueioCliente(clienteId), status);
      void queryClient.invalidateQueries({ queryKey: whatsappOficialKeys.bloqueios });
    },
  });
}

export function useBloqueiosWhatsapp(
  filtros: FiltrosBloqueiosWhatsapp,
  opcoes: { habilitado?: boolean } = {},
) {
  return useQuery({
    queryKey: whatsappOficialKeys.listaBloqueios(filtros),
    queryFn: () => whatsappOficialApi.listarBloqueios(filtros),
    enabled: opcoes.habilitado ?? true,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useDesbloquearPorIdWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      whatsappOficialApi.desbloquearPorId(id, motivo),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: whatsappOficialKeys.bloqueios }),
  });
}

/** Depois de um envio (individual ou de campanha): histórico e situação de bloqueio voltam a ser lidos do backend. */
export function useAtualizarAposEnvio() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: whatsappOficialKeys.mensagens });
    void queryClient.invalidateQueries({ queryKey: whatsappOficialKeys.bloqueios });
  };
}
