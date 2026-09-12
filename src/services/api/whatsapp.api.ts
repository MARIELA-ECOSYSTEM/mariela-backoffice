import { apiClient } from "./client";

/**
 * Contrato real da API NestJS (Etapa Pré-22 — Evolution API/Baileys):
 *   GET  /integracoes/whatsapp/status
 *   POST /integracoes/whatsapp/conectar
 *   POST /integracoes/whatsapp/desconectar
 *   POST /integracoes/whatsapp/mensagens
 *
 * `tipo`+`id` identificam o destinatário (Cliente/Fornecedor/Vendedor) — o
 * backend resolve telefone/nome a partir do cadastro. Nunca enviar telefone
 * nem o número da loja aqui: o backend rejeita campos fora deste contrato
 * (ValidationPipe com `forbidNonWhitelisted`) e nunca aceitaria um telefone
 * arbitrário como destinatário de qualquer forma.
 */
export type TipoDestinatarioWhatsapp = "CLIENTE" | "FORNECEDOR" | "VENDEDOR";

export interface MensagemWhatsappPayload {
  tipo: TipoDestinatarioWhatsapp;
  id: string;
  /** Texto já composto/editado na tela. Quando omitido, o backend aplica um template padrão. */
  mensagem?: string;
}

export interface MensagemWhatsappResultado {
  id: string;
  status: "enviada";
  tipo: TipoDestinatarioWhatsapp;
  /** Telefone (E.164) para o qual a mensagem foi enviada — confirmação, nunca um dado sensível novo. */
  destinatario: string;
}

export type StatusConexaoWhatsapp = "CONNECTED" | "CONNECTING" | "QRCODE" | "DISCONNECTED" | "NOT_CONFIGURED" | "ERROR";

export interface StatusWhatsapp {
  provider: "evolution-api";
  transporte: "baileys";
  instance: string;
  status: StatusConexaoWhatsapp;
  numero: string | null;
  /** Presente apenas quando `status === "QRCODE"`. */
  qrCode: string | null;
}

export const whatsappApi = {
  async enviarMensagem(payload: MensagemWhatsappPayload): Promise<MensagemWhatsappResultado> {
    const { data } = await apiClient.post<MensagemWhatsappResultado>(
      "/integracoes/whatsapp/mensagens",
      payload,
    );
    return data;
  },

  async obterStatus(): Promise<StatusWhatsapp> {
    const { data } = await apiClient.get<StatusWhatsapp>("/integracoes/whatsapp/status");
    return data;
  },

  async conectar(): Promise<StatusWhatsapp> {
    const { data } = await apiClient.post<StatusWhatsapp>("/integracoes/whatsapp/conectar", {});
    return data;
  },

  async desconectar(): Promise<StatusWhatsapp> {
    const { data } = await apiClient.post<StatusWhatsapp>("/integracoes/whatsapp/desconectar", {});
    return data;
  },
};
