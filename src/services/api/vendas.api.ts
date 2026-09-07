import { apiClient } from "./client";
import type { ApiFacets, QueryParams } from "@/types/api";
import { selecaoParaQuery } from "@/lib/filtros/facetas-servidor";
import type {
  BaixaParcelaPayload,
  CancelamentoPayload,
  VendaDetalhe,
  VendaFiltros,
  VendaResumo,
  VendasEstatisticas,
  VendasMeta,
} from "@/types/venda";

/** Mesmos defaults do backend (`PAGINA_PADRAO`/`LIMITE_PADRAO`/`LIMITE_MAXIMO` em `vendas.constants.ts`). */
export const PAGINA_PADRAO_VENDAS = 1;
export const LIMITE_PADRAO_VENDAS = 20;
export const LIMITE_MAXIMO_VENDAS = 100;

export interface ListaVendas {
  vendas: VendaResumo[];
  meta: VendasMeta;
  facets: ApiFacets;
}

/**
 * Serviço de VENDAS — somente consulta e administração.
 * A criação de vendas pertence ao MARIELA PDV e não existe neste contrato.
 */
export const vendasApi = {
  async listar(filtros: VendaFiltros = {}): Promise<ListaVendas> {
    const page = filtros.page ?? PAGINA_PADRAO_VENDAS;
    const limit = filtros.limit ?? LIMITE_PADRAO_VENDAS;

    const params: QueryParams = {
      busca: filtros.busca,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      page,
      limit,
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<VendaResumo[]>("/vendas", { params });
    return {
      vendas: data,
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
      facets: facets ?? {},
    };
  },
  async estatisticas(): Promise<VendasEstatisticas> {
    const { data } = await apiClient.get<VendasEstatisticas>("/vendas/estatisticas");
    return data;
  },
  async obter(id: string): Promise<VendaDetalhe> {
    const { data } = await apiClient.get<VendaDetalhe>(`/vendas/${id}`);
    return data;
  },
  async baixarParcela(
    id: string,
    parcelaId: string,
    payload: BaixaParcelaPayload,
  ): Promise<VendaDetalhe> {
    const { data } = await apiClient.post<VendaDetalhe>(
      `/vendas/${id}/parcelas/${parcelaId}/baixa`,
      payload,
    );
    return data;
  },
  async cancelar(id: string, payload: CancelamentoPayload): Promise<VendaDetalhe> {
    const { data } = await apiClient.post<VendaDetalhe>(`/vendas/${id}/cancelamento`, payload);
    return data;
  },
};
