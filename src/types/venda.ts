/**
 * Contrato de leitura de vendas usado pelos indicadores do Dashboard.
 *
 * As REGRAS de venda pertencem ao MARIELA PDV; aqui o Backoffice apenas consome
 * um resumo administrativo já calculado pela API. Nenhuma escrita é prevista.
 */
export type StatusVenda = "concluida" | "pendente" | "cancelada";

export interface VendaResumo {
  id: string;
  /** Número sequencial exibido ao operador (ex.: "000123"). */
  numero: string;
  /** Data/hora da venda em ISO. */
  dataVenda: string;
  clienteId: string | null;
  clienteNome: string;
  vendedorId: string | null;
  vendedorNome: string;
  totalItens: number;
  valorFinal: number;
  formaPagamento: string;
  status: StatusVenda;
}

export const LABEL_STATUS_VENDA: Record<StatusVenda, string> = {
  concluida: "Concluída",
  pendente: "Pendente",
  cancelada: "Cancelada",
};
