import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappApi, type MensagemWhatsappPayload } from "@/services/api/whatsapp.api";

export const whatsappKeys = { status: ["integracoes", "whatsapp", "status"] as const };

/** Envio de mensagem de WhatsApp para um Cliente/Fornecedor/Vendedor cadastrado. */
export function useEnviarMensagemWhatsapp() {
  return useMutation({
    mutationFn: (payload: MensagemWhatsappPayload) => whatsappApi.enviarMensagem(payload),
  });
}

/** Estado atual da instância (provider, número, conexão) — tela de Integrações. */
export function useWhatsappStatus(opcoes: { habilitado?: boolean } = {}) {
  return useQuery({
    queryKey: whatsappKeys.status,
    queryFn: () => whatsappApi.obterStatus(),
    enabled: opcoes.habilitado ?? true,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function useConectarWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => whatsappApi.conectar(),
    onSuccess: (status) => queryClient.setQueryData(whatsappKeys.status, status),
  });
}

export function useDesconectarWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => whatsappApi.desconectar(),
    onSuccess: (status) => queryClient.setQueryData(whatsappKeys.status, status),
  });
}
