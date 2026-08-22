import { apiClient } from "./client";
import type { EntradaEstoqueRequest, ResumoEstoqueProduto, SaidaEstoqueRequest } from "@/types/estoque";
import type { Produto } from "@/types/produto";
import type { FiltroDisponibilidade } from "@/types/produto";

export const estoqueApi = {
  async listar(filtros: { busca?: string; disponibilidade?: FiltroDisponibilidade } = {}): Promise<
    ResumoEstoqueProduto[]
  > {
    const { data } = await apiClient.get<ResumoEstoqueProduto[]>("/estoque", {
      params: { busca: filtros.busca, disponibilidade: filtros.disponibilidade },
    });
    return data;
  },
  async entrada(payload: EntradaEstoqueRequest): Promise<Produto> {
    const { data } = await apiClient.post<Produto>("/estoque/entrada", payload);
    return data;
  },
  async saida(payload: SaidaEstoqueRequest): Promise<Produto> {
    const { data } = await apiClient.post<Produto>("/estoque/saida", payload);
    return data;
  },
};
