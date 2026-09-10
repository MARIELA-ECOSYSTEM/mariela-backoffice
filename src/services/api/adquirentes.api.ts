import { apiClient } from "./client";
import type { ApiMeta, QueryParams } from "@/types/api";
import type {
  Adquirente,
  AdquirentesFiltros,
  AtualizarAdquirentePayload,
  CriarAdquirentePayload,
} from "@/types/adquirente";

export interface ListaAdquirentes {
  adquirentes: Adquirente[];
  meta: ApiMeta;
}

/**
 * `GET /adquirentes` é SEMPRE paginado no backend real (sem o modo "array
 * completo sem parâmetros" que outros módulos têm) — por isso `listar` aqui
 * sempre envia `page`/`limit`, ao contrário de `vendasApi.listar()`/
 * `clientesApi.listar()`, que nunca enviam parâmetro nenhum de propósito.
 */
export const adquirentesApi = {
  async listar(filtros: AdquirentesFiltros = {}): Promise<ListaAdquirentes> {
    const params: QueryParams = {
      busca: filtros.busca,
      page: filtros.page ?? 1,
      limit: filtros.limit ?? 20,
    };
    const { data, meta } = await apiClient.get<Adquirente[]>("/adquirentes", { params });
    return { adquirentes: data, meta: meta ?? {} };
  },

  async obter(id: string): Promise<Adquirente> {
    const { data } = await apiClient.get<Adquirente>(`/adquirentes/${id}`);
    return data;
  },

  async criar(payload: CriarAdquirentePayload): Promise<Adquirente> {
    const { data } = await apiClient.post<Adquirente>("/adquirentes", payload);
    return data;
  },

  /** `PATCH` parcial — envie somente os campos que devem mudar. */
  async atualizar(id: string, payload: AtualizarAdquirentePayload): Promise<Adquirente> {
    const { data } = await apiClient.patch<Adquirente>(`/adquirentes/${id}`, payload);
    return data;
  },

  /** Conveniência sobre o mesmo `PATCH /adquirentes/:id` — não existe endpoint de status dedicado. */
  async alterarStatus(id: string, ativo: boolean): Promise<Adquirente> {
    const { data } = await apiClient.patch<Adquirente>(`/adquirentes/${id}`, { ativo });
    return data;
  },

  async remover(id: string): Promise<void> {
    await apiClient.delete(`/adquirentes/${id}`);
  },
};
