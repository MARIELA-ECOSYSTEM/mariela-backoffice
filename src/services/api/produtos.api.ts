import { apiClient } from "./client";
import type { ApiMeta, QueryParams } from "@/types/api";
import type { Produto, ProdutoFiltros, ProdutoPayload, PromocaoRequest } from "@/types/produto";

export interface ListaProdutos {
  produtos: Produto[];
  meta: ApiMeta;
}

export const produtosApi = {
  async listar(filtros: ProdutoFiltros = {}): Promise<ListaProdutos> {
    const params: QueryParams = {
      busca: filtros.busca,
      categoria: filtros.categoria,
      colecaoId: filtros.colecaoId,
      campanhaId: filtros.campanhaId,
      fornecedorId: filtros.fornecedorId,
      disponibilidade: filtros.disponibilidade,
      promocao: filtros.promocao,
      novidade: filtros.novidade,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
    };
    const { data, meta } = await apiClient.get<Produto[]>("/produtos", { params });
    return { produtos: data, meta: meta ?? {} };
  },

  async obter(id: string): Promise<Produto> {
    const { data } = await apiClient.get<Produto>(`/produtos/${id}`);
    return data;
  },

  async criar(payload: ProdutoPayload): Promise<Produto> {
    const { data } = await apiClient.post<Produto>("/produtos", payload);
    return data;
  },

  async atualizar(id: string, payload: ProdutoPayload): Promise<Produto> {
    const { data } = await apiClient.put<Produto>(`/produtos/${id}`, payload);
    return data;
  },

  async excluir(id: string): Promise<void> {
    await apiClient.delete<{ id: string }>(`/produtos/${id}`);
  },

  async definirPromocao(id: string, payload: PromocaoRequest): Promise<Produto> {
    const { data } = await apiClient.patch<Produto>(`/produtos/${id}/promocao`, payload);
    return data;
  },
};
