import { apiClient } from "./client";
import type { ApiFacets, QueryParams } from "@/types/api";
import { selecaoParaQuery } from "@/lib/filtros/facetas-servidor";
import type {
  AberturaCaixaPayload,
  Caixa,
  CaixaDetalhe,
  CaixaEstatisticas,
  CaixaFiltros,
  CaixasMeta,
  EntradaCaixaPayload,
  FechamentoCaixaPayload,
  MovimentacaoCaixa,
  MovimentosCaixaFiltros,
  MovimentosCaixaMeta,
  RecebimentoCaixa,
  SaidaCaixaPayload,
} from "@/types/caixa";
import type { VendaResumo } from "@/types/venda";

/** Mesmos defaults do backend (`PAGINA_PADRAO`/`LIMITE_PADRAO`/`LIMITE_MAXIMO` em `caixas.constants.ts`). */
export const PAGINA_PADRAO_CAIXAS = 1;
export const LIMITE_PADRAO_CAIXAS = 20;
export const LIMITE_MAXIMO_CAIXAS = 100;

export const LIMITE_PADRAO_MOVIMENTOS = 50;

export interface ListaCaixas {
  caixas: Caixa[];
  meta: CaixasMeta;
  facets: ApiFacets;
}

export interface ListaMovimentosCaixa {
  movimentacoes: MovimentacaoCaixa[];
  meta: MovimentosCaixaMeta;
}

/**
 * Serviço de CAIXA. Não existe PUT/DELETE de movimentação: o histórico
 * financeiro é imutável e correções nascem de novas movimentações.
 */
export const caixasApi = {
  async listar(filtros: CaixaFiltros = {}): Promise<ListaCaixas> {
    const page = filtros.page ?? PAGINA_PADRAO_CAIXAS;
    const limit = filtros.limit ?? LIMITE_PADRAO_CAIXAS;

    const params: QueryParams = {
      busca: filtros.busca,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      page,
      limit,
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<Caixa[]>("/caixas", { params });
    return {
      caixas: data,
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
      facets: facets ?? {},
    };
  },
  async atual(): Promise<CaixaDetalhe | null> {
    const { data } = await apiClient.get<CaixaDetalhe | null>("/caixas/atual");
    return data;
  },
  async estatisticas(): Promise<CaixaEstatisticas> {
    const { data } = await apiClient.get<CaixaEstatisticas>("/caixas/estatisticas");
    return data;
  },
  async obter(id: string): Promise<CaixaDetalhe> {
    const { data } = await apiClient.get<CaixaDetalhe>(`/caixas/${id}`);
    return data;
  },
  async movimentacoes(
    id: string,
    filtros: MovimentosCaixaFiltros = {},
  ): Promise<ListaMovimentosCaixa> {
    const page = filtros.page ?? 1;
    const limit = filtros.limit ?? LIMITE_PADRAO_MOVIMENTOS;
    const params: QueryParams = {
      tipo: filtros.tipo?.join(","),
      responsavelId: filtros.responsavelId,
      ordem: filtros.ordem,
      page,
      limit,
    };
    const { data, meta } = await apiClient.get<MovimentacaoCaixa[]>(`/caixas/${id}/movimentacoes`, {
      params,
    });
    return {
      movimentacoes: data,
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
    };
  },
  async vendas(id: string): Promise<VendaResumo[]> {
    const { data } = await apiClient.get<VendaResumo[]>(`/caixas/${id}/vendas`);
    return data;
  },
  async recebimentos(id: string): Promise<RecebimentoCaixa[]> {
    const { data } = await apiClient.get<RecebimentoCaixa[]>(`/caixas/${id}/recebimentos`);
    return data;
  },
  async abrir(payload: AberturaCaixaPayload): Promise<CaixaDetalhe> {
    const { data } = await apiClient.post<CaixaDetalhe>("/caixas", payload);
    return data;
  },
  async entrada(id: string, payload: EntradaCaixaPayload): Promise<CaixaDetalhe> {
    const { data } = await apiClient.post<CaixaDetalhe>(`/caixas/${id}/entrada`, payload);
    return data;
  },
  async saida(id: string, payload: SaidaCaixaPayload): Promise<CaixaDetalhe> {
    const { data } = await apiClient.post<CaixaDetalhe>(`/caixas/${id}/saida`, payload);
    return data;
  },
  async fechar(id: string, payload: FechamentoCaixaPayload): Promise<CaixaDetalhe> {
    const { data } = await apiClient.post<CaixaDetalhe>(`/caixas/${id}/fechamento`, payload);
    return data;
  },
};
