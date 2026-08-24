import { apiClient } from "./client";
import type {
  AberturaCaixaPayload,
  Caixa,
  CaixaDetalhe,
  CaixaEstatisticas,
  EntradaCaixaPayload,
  FechamentoCaixaPayload,
  MovimentacaoCaixa,
  RecebimentoCaixa,
  SaidaCaixaPayload,
} from "@/types/caixa";
import type { VendaResumo } from "@/types/venda";

/**
 * Serviço de CAIXA. Não existe PUT/DELETE de movimentação: o histórico
 * financeiro é imutável e correções nascem de novas movimentações.
 */
export const caixasApi = {
  async listar(): Promise<Caixa[]> {
    const { data } = await apiClient.get<Caixa[]>("/caixas");
    return data;
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
  async movimentacoes(id: string): Promise<MovimentacaoCaixa[]> {
    const { data } = await apiClient.get<MovimentacaoCaixa[]>(`/caixas/${id}/movimentacoes`);
    return data;
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
