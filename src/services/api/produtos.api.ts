import { apiClient } from "./client";
import type { ApiFacets, QueryParams } from "@/types/api";
import { selecaoParaQuery } from "@/lib/filtros/facetas-servidor";
import type {
  FotoPrincipalRequest,
  NovidadeRequest,
  Produto,
  ProdutoFiltros,
  ProdutoPayload,
  ProdutosMeta,
  PromocaoRequest,
} from "@/types/produto";

/** Mesmos defaults do backend (`PAGINA_PADRAO`/`LIMITE_PADRAO` em `produtos.constants.ts`). */
export const PAGINA_PADRAO_PRODUTOS = 1;
export const LIMITE_PADRAO_PRODUTOS = 20;

export interface ListaProdutos {
  produtos: Produto[];
  meta: ProdutosMeta;
  facets: ApiFacets;
}

export const produtosApi = {
  async listar(filtros: ProdutoFiltros = {}): Promise<ListaProdutos> {
    const page = filtros.page ?? PAGINA_PADRAO_PRODUTOS;
    const limit = filtros.limit ?? LIMITE_PADRAO_PRODUTOS;

    const params: QueryParams = {
      busca: filtros.busca,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      page,
      limit,
      // Seleção multivalorada das facetas: `?categorias=a,b&estoque=com_estoque`
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<Produto[]>("/produtos", { params });
    return {
      produtos: data,
      // A API sempre devolve os quatro campos para este endpoint; os defaults
      // aqui só cobrem o mock antigo/uma resposta inesperada, nunca mascaram
      // um valor real diferente do que veio do servidor.
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
      facets: facets ?? {},
    };
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
