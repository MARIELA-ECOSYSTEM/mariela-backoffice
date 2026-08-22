import { apiClient } from "./client";
import type { AdicionarTamanhoRequest, CriarVarianteRequest, Variante } from "@/types/variante";

export const variantesApi = {
  async listar(produtoId: string): Promise<Variante[]> {
    const { data } = await apiClient.get<Variante[]>(`/produtos/${produtoId}/variantes`);
    return data;
  },
  async criar(produtoId: string, payload: CriarVarianteRequest): Promise<Variante> {
    const { data } = await apiClient.post<Variante>(`/produtos/${produtoId}/variantes`, payload);
    return data;
  },
  async atualizar(
    produtoId: string,
    varianteId: string,
    payload: CriarVarianteRequest,
  ): Promise<Variante> {
    const { data } = await apiClient.put<Variante>(
      `/produtos/${produtoId}/variantes/${varianteId}`,
      payload,
    );
    return data;
  },
  async excluir(produtoId: string, varianteId: string): Promise<void> {
    await apiClient.delete(`/produtos/${produtoId}/variantes/${varianteId}`);
  },
  async adicionarTamanho(
    produtoId: string,
    varianteId: string,
    payload: AdicionarTamanhoRequest,
  ): Promise<Variante> {
    const { data } = await apiClient.post<Variante>(
      `/produtos/${produtoId}/variantes/${varianteId}/tamanhos`,
      payload,
    );
    return data;
  },
  async excluirTamanho(produtoId: string, varianteId: string, tamanhoId: string): Promise<void> {
    await apiClient.delete(`/produtos/${produtoId}/variantes/${varianteId}/tamanhos/${tamanhoId}`);
  },
};
