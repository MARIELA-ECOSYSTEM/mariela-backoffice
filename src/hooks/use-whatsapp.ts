import { useMutation } from "@tanstack/react-query";
import { whatsappApi, type MensagemWhatsappPayload } from "@/services/api/whatsapp.api";

/**
 * Envio de mensagem de WhatsApp.
 * Hoje resolvido pelo mock (simulação); a troca pela API real não afeta a UI.
 */
export function useEnviarMensagemWhatsapp() {
  return useMutation({
    mutationFn: (payload: MensagemWhatsappPayload) => whatsappApi.enviarMensagem(payload),
  });
}
