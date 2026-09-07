/**
 * Contratos do módulo VENDAS do MARIELA BACKOFFICE.
 *
 * As REGRAS de venda pertencem ao MARIELA PDV: aqui o Backoffice apenas
 * CONSULTA e ADMINISTRA (baixa de parcela e cancelamento/devolução).
 * Toda venda finalizada é IMUTÁVEL — nenhuma edição de itens/valores existe.
 *
 * Endpoints (implementados pela API NestJS):
 *   GET    /vendas                      → PaginatedResponse<VendaResumo> (busca+facetas+ordenação, server-side)
 *   GET    /vendas/estatisticas         → ApiResponse<VendasEstatisticas>
 *   GET    /vendas/:id                  → ApiResponse<VendaDetalhe>
 *   POST   /vendas/:id/parcelas/:pid/baixa
 *   POST   /vendas/:id/cancelamento
 *
 * Deliberadamente NÃO existe `POST /vendas`: a criação de venda pertence ao
 * futuro MARIELA PDV.
 */
import type { SelecaoFacetas } from "@/lib/filtros/facetas";

/**
 * EM_PAGAMENTO → estoque já baixado no PDV, valor pendente > 0.
 * CONCLUIDA    → valor pendente = 0.
 * CANCELADA    → venda cancelada integralmente (com devolução ao estoque).
 */
export type StatusVenda = "em_pagamento" | "concluida" | "cancelada";

export const LABEL_STATUS_VENDA: Record<StatusVenda, string> = {
  em_pagamento: "Em pagamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const STATUS_VENDA: StatusVenda[] = ["em_pagamento", "concluida", "cancelada"];

/** Linha da listagem — já traz os números calculados pela API. */
export interface VendaResumo {
  id: string;
  /** Código da venda gerado pela API (`VENDA-2026-08-23-0001`). */
  codigo: string;
  /** Número sequencial exibido ao operador (ex.: "000123"). */
  numero: string;
  /** Data/hora da venda em ISO. */
  dataVenda: string;
  clienteId: string | null;
  clienteNome: string;
  vendedorId: string | null;
  vendedorNome: string;
  /** Caixa/turno em que a venda foi registrada no PDV. */
  caixaId: string | null;
  caixaCodigo: string | null;
  totalItens: number;
  /** Σ preço de tabela × quantidade (antes de promoções e descontos). */
  valorBruto: number;
  /** Desconto originado de promoção do produto. */
  descontoPromocional: number;
  /** Desconto concedido na venda pelo operador. */
  descontoVenda: number;
  descontoTotal: number;
  /** Valor efetivamente cobrado (bruto − descontos). */
  valorFinal: number;
  valorPago: number;
  valorPendente: number;
  /** Valor já devolvido por devolução parcial/integral. */
  valorDevolvido: number;
  temPromocao: boolean;
  temDesconto: boolean;
  formaPagamento: string;
  totalParcelas: number;
  parcelasPagas: number;
  status: StatusVenda;
}

/** Item da venda — SNAPSHOT histórico: preços da época, nunca recalculados. */
export interface ItemVenda {
  id: string;
  produtoId: string;
  codProduto: string;
  nome: string;
  categoria: string;
  varianteId: string | null;
  codVariante: string | null;
  cor: string | null;
  tamanho: string | null;
  foto: string | null;
  quantidade: number;
  /** Preço de tabela vigente no momento da venda. */
  precoOriginal: number;
  /** Preço efetivamente praticado (promoção da época já aplicada). */
  precoPraticado: number;
  emPromocao: boolean;
  subtotal: number;
  /** Quantidade já devolvida deste item. */
  quantidadeDevolvida: number;
}

export interface PagamentoVenda {
  id: string;
  forma: string;
  valor: number;
  dataPagamento: string;
  /** Nº de parcelas do meio de pagamento (1 = à vista). */
  parcelas: number;
  observacao?: string;
}

export interface ParcelaVenda {
  id: string;
  numero: number;
  total: number;
  valor: number;
  /** Vencimento em ISO. */
  vencimento: string;
  /** Data da baixa; nulo enquanto em aberto. */
  pagoEm: string | null;
  formaPagamento: string | null;
}

export type TipoEventoVenda =
  "criacao" | "pagamento" | "baixa_parcela" | "devolucao" | "cancelamento";

export interface EventoVenda {
  id: string;
  dataHora: string;
  tipo: TipoEventoVenda;
  descricao: string;
  autor: string;
}

export interface ItemDevolvido {
  itemId: string;
  codProduto: string;
  nome: string;
  quantidade: number;
  valor: number;
}

export interface CancelamentoVenda {
  tipo: "integral" | "parcial";
  motivo: string;
  dataHora: string;
  autor: string;
  valorDevolvido: number;
  itens: ItemDevolvido[];
}

export interface VendaDetalhe extends VendaResumo {
  observacao: string;
  itens: ItemVenda[];
  pagamentos: PagamentoVenda[];
  parcelas: ParcelaVenda[];
  historico: EventoVenda[];
  /** Última operação de cancelamento/devolução, quando houver. */
  cancelamento: CancelamentoVenda | null;
}

export interface VendasEstatisticas {
  totalVendas: number;
  faturamento: number;
  ticketMedio: number;
  itensVendidos: number;
  vendasEmPagamento: number;
  valorEmAberto: number;
  vendasCanceladas: number;
  valorCancelado: number;
  descontoConcedido: number;
}

export interface BaixaParcelaPayload {
  formaPagamento: string;
}

export interface DevolucaoItemPayload {
  itemId: string;
  quantidade: number;
}

export interface CancelamentoPayload {
  tipo: "integral" | "parcial";
  motivo: string;
  /** Obrigatório na devolução parcial. */
  itens?: DevolucaoItemPayload[];
}

export type OrdenarVendaPor = "data" | "valor" | "pendente";
export type Ordem = "asc" | "desc";

/**
 * Espelha exatamente `ListarVendasQueryDto` do backend
 * (`backend/src/modules/vendas/dto/listar-vendas-query.dto.ts`): `busca` +
 * `ordenarPor`/`ordem` + a seleção de facetas em CSV (`status`, `periodo`,
 * `vendedor`, `cliente`, `pagamento`, `caixa`, `valor`, `condicoes`,
 * `financeiro`) + `page`/`limit`.
 */
export interface VendaFiltros {
  facetas?: SelecaoFacetas | undefined;
  busca?: string | undefined;
  ordenarPor?: OrdenarVendaPor | undefined;
  ordem?: Ordem | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

/** Paginação real, sempre devolvida pelo backend para `GET /vendas` — nunca calculada no cliente. */
export interface VendasMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
