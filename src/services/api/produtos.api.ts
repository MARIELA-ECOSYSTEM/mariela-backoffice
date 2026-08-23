import { apiClient } from "./client";
import type { ApiFacets, ApiMeta, QueryParams } from "@/types/api";
import { selecaoParaQuery } from "@/lib/filtros/facetas-servidor";
import type {
  FotoPrincipalRequest,
  NovidadeRequest,
  Produto,
  ProdutoFiltros,
  ProdutoPayload,
  PromocaoRequest,
} from "@/types/produto";

export interface ListaProdutos {
  produtos: Produto[];
  meta: ApiMeta;
  /** Contagens dos filtros vindas da camada de dados (mock hoje, API amanhã). */
  facets: ApiFacets;
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
      // Seleção multivalorada das facetas: `?categorias=a,b&estoque=com_estoque`
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<Produto[]>("/produtos", { params });
    return { produtos: data, meta: meta ?? {}, facets: facets ?? {} };
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

  async definirFotoPrincipal(id: string, payload: FotoPrincipalRequest): Promise<Produto> {
    const { data } = await apiClient.patch<Produto>(`/produtos/${id}/foto-principal`, payload);
    return data;
  },

  async definirNovidade(id: string, payload: NovidadeRequest): Promise<Produto> {
    const { data } = await apiClient.patch<Produto>(`/produtos/${id}/novidade`, payload);
    return data;
  },

  async definirPromocao(id: string, payload: PromocaoRequest): Promise<Produto> {
    const { data } = await apiClient.patch<Produto>(`/produtos/${id}/promocao`, payload);
    return data;
  },
};
