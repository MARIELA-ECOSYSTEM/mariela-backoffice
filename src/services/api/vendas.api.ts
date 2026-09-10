import { apiClient } from "./client";
import type {
  BaixaParcelaPayload,
  CancelamentoPayload,
  RegistrarRecebimentoPayload,
  VendaDetalhe,
  VendaResumo,
  VendasEstatisticas,
} from "@/types/venda";

/**
 * Serviço de VENDAS — somente consulta e administração.
 * A criação de vendas pertence ao MARIELA PDV e não existe neste contrato.
 */
export const vendasApi = {
  async listar(): Promise<VendaResumo[]> {
    const { data } = await apiClient.get<VendaResumo[]>("/vendas");
    return data;
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
  async receberPagamento(
    id: string,
    payload: RegistrarRecebimentoPayload,
  ): Promise<VendaDetalhe> {
    const { data } = await apiClient.post<VendaDetalhe>(`/vendas/${id}/recebimentos`, payload);
    return data;
  },
};
