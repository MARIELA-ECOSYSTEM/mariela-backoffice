import { apiClient } from "./client";
import type { ApiFacets, QueryParams } from "@/types/api";
import { selecaoParaQuery } from "@/lib/filtros/facetas-servidor";
import type { Cliente, ClienteFiltros, ClientePayload, ClientesMeta } from "@/types/cliente";
import type {
  Fornecedor,
  FornecedorFiltros,
  FornecedorHistoricoItem,
  FornecedorPayload,
  FornecedoresMeta,
} from "@/types/fornecedor";
import type { Colecao, ColecaoFiltros, ColecaoPayload, ColecoesMeta } from "@/types/colecao";
import type { Campanha, CampanhaFiltros, CampanhaPayload, CampanhasMeta } from "@/types/campanha";
import type { Produto } from "@/types/produto";
import type { VendaResumo } from "@/types/venda";

/** Mesmos defaults do backend (`PAGINA_PADRAO`/`LIMITE_PADRAO`/`LIMITE_MAXIMO` em `clientes.constants.ts`). */
export const PAGINA_PADRAO_CLIENTES = 1;
export const LIMITE_PADRAO_CLIENTES = 20;
export const LIMITE_MAXIMO_CLIENTES = 100;

export interface ListaClientes {
  clientes: Cliente[];
  meta: ClientesMeta;
  facets: ApiFacets;
}

export const clientesApi = {
  async listar(filtros: ClienteFiltros = {}): Promise<ListaClientes> {
    const page = filtros.page ?? PAGINA_PADRAO_CLIENTES;
    const limit = filtros.limit ?? LIMITE_PADRAO_CLIENTES;

    const params: QueryParams = {
      busca: filtros.busca,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      page,
      limit,
      // Seleção multivalorada das facetas: `?historico=com,recorrente`
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<Cliente[]>("/clientes", { params });
    return {
      clientes: data,
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
      facets: facets ?? {},
    };
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

/** Mesmos defaults do backend (`PAGINA_PADRAO`/`LIMITE_PADRAO`/`LIMITE_MAXIMO` em `fornecedores.constants.ts`). */
export const PAGINA_PADRAO_FORNECEDORES = 1;
export const LIMITE_PADRAO_FORNECEDORES = 20;
export const LIMITE_MAXIMO_FORNECEDORES = 100;

export interface ListaFornecedores {
  fornecedores: Fornecedor[];
  meta: FornecedoresMeta;
  facets: ApiFacets;
}

export const fornecedoresApi = {
  async listar(filtros: FornecedorFiltros = {}): Promise<ListaFornecedores> {
    const page = filtros.page ?? PAGINA_PADRAO_FORNECEDORES;
    const limit = filtros.limit ?? LIMITE_PADRAO_FORNECEDORES;

    const params: QueryParams = {
      busca: filtros.busca,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      page,
      limit,
      // Seleção multivalorada das facetas: `?produtos=1-5,16+`
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<Fornecedor[]>("/fornecedores", { params });
    return {
      fornecedores: data,
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
      facets: facets ?? {},
    };
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

/** Mesmos defaults do backend (`PAGINA_PADRAO`/`LIMITE_PADRAO`/`LIMITE_MAXIMO` em `colecoes.constants.ts`). */
export const PAGINA_PADRAO_COLECOES = 1;
export const LIMITE_PADRAO_COLECOES = 20;
export const LIMITE_MAXIMO_COLECOES = 100;

export interface ListaColecoes {
  colecoes: Colecao[];
  meta: ColecoesMeta;
  facets: ApiFacets;
}

export const colecoesApi = {
  async listar(filtros: ColecaoFiltros = {}): Promise<ListaColecoes> {
    const page = filtros.page ?? PAGINA_PADRAO_COLECOES;
    const limit = filtros.limit ?? LIMITE_PADRAO_COLECOES;

    const params: QueryParams = {
      busca: filtros.busca,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      page,
      limit,
      // Seleção multivalorada das facetas: `?situacao=ativa,agendada`
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<Colecao[]>("/colecoes", { params });
    return {
      colecoes: data,
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
      facets: facets ?? {},
    };
  },
  async obter(id: string): Promise<Colecao> {
    const { data } = await apiClient.get<Colecao>(`/colecoes/${id}`);
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
  /** Produtos atualmente vinculados à coleção — agregado calculado pelo backend. */
  async listarProdutos(id: string): Promise<Produto[]> {
    const { data } = await apiClient.get<Produto[]>(`/colecoes/${id}/produtos`);
    return data;
  },
  async remover(id: string): Promise<void> {
    await apiClient.delete(`/colecoes/${id}`);
  },
};

/** Mesmos defaults do backend (`PAGINA_PADRAO`/`LIMITE_PADRAO`/`LIMITE_MAXIMO` em `campanhas.constants.ts`). */
export const PAGINA_PADRAO_CAMPANHAS = 1;
export const LIMITE_PADRAO_CAMPANHAS = 20;
export const LIMITE_MAXIMO_CAMPANHAS = 100;

export interface ListaCampanhas {
  campanhas: Campanha[];
  meta: CampanhasMeta;
  facets: ApiFacets;
}

export const campanhasApi = {
  async listar(filtros: CampanhaFiltros = {}): Promise<ListaCampanhas> {
    const page = filtros.page ?? PAGINA_PADRAO_CAMPANHAS;
    const limit = filtros.limit ?? LIMITE_PADRAO_CAMPANHAS;

    const params: QueryParams = {
      busca: filtros.busca,
      ordenarPor: filtros.ordenarPor,
      ordem: filtros.ordem,
      page,
      limit,
      // Seleção multivalorada das facetas: `?situacao=ativa,agendada`
      ...selecaoParaQuery(filtros.facetas),
    };
    const { data, meta, facets } = await apiClient.get<Campanha[]>("/campanhas", { params });
    return {
      campanhas: data,
      meta: {
        page: meta?.page ?? page,
        limit: meta?.limit ?? limit,
        total: meta?.total ?? 0,
        totalPages: meta?.totalPages ?? 1,
      },
      facets: facets ?? {},
    };
  },
  async obter(id: string): Promise<Campanha> {
    const { data } = await apiClient.get<Campanha>(`/campanhas/${id}`);
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
  /** Produtos atualmente vinculados à campanha — agregado calculado pelo backend. */
  async listarProdutos(id: string): Promise<Produto[]> {
    const { data } = await apiClient.get<Produto[]>(`/campanhas/${id}/produtos`);
    return data;
  },
  async remover(id: string): Promise<void> {
    await apiClient.delete(`/campanhas/${id}`);
  },
};
