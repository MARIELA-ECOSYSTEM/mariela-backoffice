import { apiClient } from "./client";
import type { Configuracoes, DadosLoja, ListaConfiguravel } from "@/types/configuracoes";

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
};
