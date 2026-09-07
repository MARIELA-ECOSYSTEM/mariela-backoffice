import { apiClient } from "./client";
import type { ApiFacets, QueryParams } from "@/types/api";
import { selecaoParaQuery } from "@/lib/filtros/facetas-servidor";
import type {
  Vendedor,
  VendedorFiltros,
  VendedorPayload,
  VendedorSenhaPayload,
  VendedorStatusPayload,
  VendedoresMeta,
} from "@/types/vendedor";
import type { VendaResumo } from "@/types/venda";

/** Mesmos defaults do backend (`PAGINA_PADRAO`/`LIMITE_PADRAO`/`LIMITE_MAXIMO` em `vendedores.constants.ts`). */
export const PAGINA_PADRAO_VENDEDORES = 1;
export const LIMITE_PADRAO_VENDEDORES = 20;
export const LIMITE_MAXIMO_VENDEDORES = 100;

export interface ListaVendedores {
  vendedores: Vendedor[];
  meta: VendedoresMeta;
  facets: ApiFacets;
}

export const vendedoresApi = {
  async listar(filtros: VendedorFiltros = {}): Promise<ListaVendedores> {
    const page = filtros.page ?? PAGINA_PADRAO_VENDEDORES;
    const limit = filtros.limit ?? LIMITE_PADRAO_VENDEDORES;

    const params: QueryParams = {
      busca: filtros.busca,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      page,
      limit,
      // Seleção multivalorada das facetas: `?vendas=sem,21+`
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<Vendedor[]>("/vendedores", { params });
    return {
      vendedores: data,
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
      facets: facets ?? {},
    };
  },
  async obter(id: string): Promise<Vendedor> {
    const { data } = await apiClient.get<Vendedor>(`/vendedores/${id}`);
    return data;
  },
  async criar(payload: VendedorPayload): Promise<Vendedor> {
    const { data } = await apiClient.post<Vendedor>("/vendedores", payload);
    return data;
  },
  async atualizar(id: string, payload: VendedorPayload): Promise<Vendedor> {
    const { data } = await apiClient.put<Vendedor>(`/vendedores/${id}`, payload);
    return data;
  },
  async alterarStatus(id: string, payload: VendedorStatusPayload): Promise<Vendedor> {
    const { data } = await apiClient.patch<Vendedor>(`/vendedores/${id}/status`, payload);
    return data;
  },
  async redefinirSenha(id: string, payload: VendedorSenhaPayload): Promise<void> {
    await apiClient.patch(`/vendedores/${id}/senha`, payload);
  },
  /** Histórico de vendas do vendedor (somente leitura — origem: MARIELA PDV). */
  async listarVendas(id: string): Promise<VendaResumo[]> {
    const { data } = await apiClient.get<VendaResumo[]>(`/vendedores/${id}/vendas`);
    return data;
  },
  async remover(id: string): Promise<void> {
    await apiClient.delete(`/vendedores/${id}`);
  },
};
