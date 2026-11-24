import { apiClient } from "./client";
import type {
  Configuracoes,
  DadosLoja,
  ListaConfiguravel,
  SalvarMensagemPadraoWhatsapp,
} from "@/types/configuracoes";

/** Fase 22.8.9.10.7.3 — mensagens padrão de WhatsApp (ADMIN), persistidas na configuração global do backend. */
const MENSAGENS_PADRAO = "/configuracoes/whatsapp/mensagens-padrao";

export const configuracoesApi = {
  async obter(): Promise<Configuracoes> {
    const { data } = await apiClient.get<Configuracoes>("/configuracoes");
    return data;
  },
  async atualizarLoja(payload: DadosLoja): Promise<Configuracoes> {
    const { data } = await apiClient.put<Configuracoes>("/configuracoes/loja", payload);
    return data;
  },
  async adicionarItem(lista: ListaConfiguravel, valor: string): Promise<Configuracoes> {
    const { data } = await apiClient.post<Configuracoes>(`/configuracoes/${lista}`, { valor });
    return data;
  },
  async removerItem(lista: ListaConfiguravel, valor: string): Promise<Configuracoes> {
    const { data } = await apiClient.delete<Configuracoes>(
      `/configuracoes/${lista}/${encodeURIComponent(valor)}`,
    );
    return data;
  },
  async criarMensagemPadrao(payload: SalvarMensagemPadraoWhatsapp): Promise<Configuracoes> {
    const { data } = await apiClient.post<Configuracoes>(MENSAGENS_PADRAO, payload);
    return data;
  },
  async atualizarMensagemPadrao(
    id: string,
    payload: SalvarMensagemPadraoWhatsapp,
  ): Promise<Configuracoes> {
    const { data } = await apiClient.put<Configuracoes>(
      `${MENSAGENS_PADRAO}/${encodeURIComponent(id)}`,
      payload,
    );
    return data;
  },
  async excluirMensagemPadrao(id: string): Promise<Configuracoes> {
    const { data } = await apiClient.delete<Configuracoes>(
      `${MENSAGENS_PADRAO}/${encodeURIComponent(id)}`,
    );
    return data;
  },
};
