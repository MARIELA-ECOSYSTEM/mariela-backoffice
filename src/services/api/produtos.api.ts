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
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      // Seleção multivalorada das facetas: `?categorias=a,b&estoque=com_estoque&novidade=novidade&promocao=sem_promocao`.
      // `novidade`/`promocao` viajam por AQUI (nunca como parâmetro simples
      // `sim`/`nao`) — o backend real só aceita o valor de faceta
      // (`novidade`/`sem_novidade`, `promocao`/`sem_promocao`), o mesmo já
      // usado por `estoque` (`com_estoque`/`sem_estoque`). Achado da Fase 5.1:
      // um `promocao`/`novidade` de nível superior chegou a existir aqui
      // (valores `sim`/`nao`), mas nunca foi populado por nenhuma tela real —
      // a única fonte de verdade sempre foi `filtros.facetas` (ver
      // `produtos/index.tsx`, grupo `FACETAS_PRODUTO.novidade`/`.promocao`).
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
