import { apiClient } from "./client";

/**
 * Contrato previsto para a futura API NestJS:
 *   POST /integracoes/whatsapp/mensagens
 *
 * Hoje a chamada é atendida pela camada de mock (simulação — nenhuma mensagem
 * real é enviada). Quando a integração real existir, basta desligar o mock:
 * nenhum componente de Clientes precisa ser alterado.
 */
export interface MensagemWhatsappPayload {
  clienteId: string;
  telefone: string;
  mensagem: string;
}

export interface MensagemWhatsappResultado {
  id: string;
  status: "preparada" | "enviada";
  /** true enquanto o envio for simulado pelo mock. */
  simulado: boolean;
}

export const whatsappApi = {
  async enviarMensagem(payload: MensagemWhatsappPayload): Promise<MensagemWhatsappResultado> {
    const { data } = await apiClient.post<MensagemWhatsappResultado>(
      "/integracoes/whatsapp/mensagens",
      payload,
    );
    return data;
  },
};
