import { apiClient } from "./client";
import type { Cliente, ClientePayload } from "@/types/cliente";
import type { Fornecedor, FornecedorHistoricoItem, FornecedorPayload } from "@/types/fornecedor";
import type { Colecao, ColecaoPayload } from "@/types/colecao";
import type { Campanha, CampanhaPayload } from "@/types/campanha";
import type { VendaResumo } from "@/types/venda";

export const clientesApi = {
  async listar(): Promise<Cliente[]> {
    const { data } = await apiClient.get<Cliente[]>("/clientes");
    return data;
  },
  async criar(payload: ClientePayload): Promise<Cliente> {
    const { data } = await apiClient.post<Cliente>("/clientes", payload);
    return data;
  },
  async atualizar(id: string, payload: ClientePayload): Promise<Cliente> {
    const { data } = await apiClient.put<Cliente>(`/clientes/${id}`, payload);
    return data;
  },
  /** Histórico de compras do cliente — agregados já calculados pelo backend. */
  async listarVendas(id: string): Promise<VendaResumo[]> {
    const { data } = await apiClient.get<VendaResumo[]>(`/clientes/${id}/vendas`);
    return data;
  },
  async remover(id: string): Promise<void> {
    await apiClient.delete(`/clientes/${id}`);
  },
};

export const fornecedoresApi = {
  async listar(): Promise<Fornecedor[]> {
    const { data } = await apiClient.get<Fornecedor[]>("/fornecedores");
    return data;
  },
  async criar(payload: FornecedorPayload): Promise<Fornecedor> {
    const { data } = await apiClient.post<Fornecedor>("/fornecedores", payload);
    return data;
  },
  async atualizar(id: string, payload: FornecedorPayload): Promise<Fornecedor> {
    const { data } = await apiClient.put<Fornecedor>(`/fornecedores/${id}`, payload);
    return data;
  },
  /** Histórico de produtos vinculados/desvinculados — agregado pelo backend. */
  async listarHistorico(id: string): Promise<FornecedorHistoricoItem[]> {
    const { data } = await apiClient.get<FornecedorHistoricoItem[]>(
      `/fornecedores/${id}/historico`,
    );
    return data;
  },
  async remover(id: string): Promise<void> {
    await apiClient.delete(`/fornecedores/${id}`);
  },
};

export const colecoesApi = {
  async listar(): Promise<Colecao[]> {
    const { data } = await apiClient.get<Colecao[]>("/colecoes");
    return data;
  },
  async criar(payload: ColecaoPayload): Promise<Colecao> {
    const { data } = await apiClient.post<Colecao>("/colecoes", payload);
    return data;
  },
  async atualizar(id: string, payload: ColecaoPayload): Promise<Colecao> {
    const { data } = await apiClient.put<Colecao>(`/colecoes/${id}`, payload);
    return data;
  },
  async alterarStatus(id: string, ativo: boolean): Promise<Colecao> {
    const { data } = await apiClient.patch<Colecao>(`/colecoes/${id}/status`, { ativo });
    return data;
  },
  async remover(id: string): Promise<void> {
    await apiClient.delete(`/colecoes/${id}`);
  },
};

export const campanhasApi = {
  async listar(): Promise<Campanha[]> {
    const { data } = await apiClient.get<Campanha[]>("/campanhas");
    return data;
  },
  async criar(payload: CampanhaPayload): Promise<Campanha> {
    const { data } = await apiClient.post<Campanha>("/campanhas", payload);
    return data;
  },
  async atualizar(id: string, payload: CampanhaPayload): Promise<Campanha> {
    const { data } = await apiClient.put<Campanha>(`/campanhas/${id}`, payload);
    return data;
  },
  async alterarStatus(id: string, ativo: boolean): Promise<Campanha> {
    const { data } = await apiClient.patch<Campanha>(`/campanhas/${id}/status`, { ativo });
    return data;
  },
  async remover(id: string): Promise<void> {
    await apiClient.delete(`/campanhas/${id}`);
  },
};
