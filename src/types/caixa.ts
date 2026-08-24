/**
 * Contratos do módulo CAIXA do MARIELA BACKOFFICE.
 *
 * O caixa é um registro FINANCEIRO INDEPENDENTE: cada abertura gera um registro
 * (`CAIXA-0001`) com suas movimentações. As vendas nascem no MARIELA PDV e são
 * apenas VINCULADAS ao caixa aberto no momento da operação.
 *
 * Regras que a API NestJS deverá reproduzir:
 * 1. Somente o valor EFETIVAMENTE RECEBIDO entra no caixa. Uma venda
 *    EM_PAGAMENTO não lança o valor pendente.
 * 2. A baixa de parcela gera um recebimento (entrada) vinculado à venda/parcela.
 * 3. Cancelamento/devolução gera uma SAÍDA correspondente ao valor devolvido.
 * 4. Caixa FECHADO é histórico imutável: não há PUT/DELETE de movimentações.
 *    Correções futuras nascem de uma nova movimentação de ajuste.
 * 5. Não existe saldo negativo: uma saída nunca pode exceder o saldo disponível.
 *
 * Endpoints previstos:
 *   GET  /caixas                        → PaginatedResponse<Caixa>
 *   GET  /caixas/atual                  → ApiResponse<Caixa | null>
 *   GET  /caixas/:id                    → ApiResponse<CaixaDetalhe>
 *   POST /caixas                        → ApiResponse<Caixa>
 *   POST /caixas/:id/entrada            → ApiResponse<CaixaDetalhe>
 *   POST /caixas/:id/saida              → ApiResponse<CaixaDetalhe>
 *   GET  /caixas/:id/movimentacoes      → ApiResponse<MovimentacaoCaixa[]>
 *   GET  /caixas/:id/vendas             → ApiResponse<VendaResumo[]>
 *   GET  /caixas/:id/recebimentos       → ApiResponse<RecebimentoCaixa[]>
 *   POST /caixas/:id/fechamento         → ApiResponse<Caixa>
 */
import type { VendaResumo } from "./venda";

export type CaixaStatus = "aberto" | "fechado";

export const LABEL_STATUS_CAIXA: Record<CaixaStatus, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
};

export const STATUS_CAIXA: CaixaStatus[] = ["aberto", "fechado"];

export type TipoMovimentacaoCaixa =
  | "venda"
  | "recebimento_parcela"
  | "entrada"
  | "saida"
  | "devolucao"
  | "cancelamento";

export const LABEL_TIPO_MOVIMENTACAO: Record<TipoMovimentacaoCaixa, string> = {
  venda: "Venda",
  recebimento_parcela: "Recebimento de parcela",
  entrada: "Entrada",
  saida: "Saída",
  devolucao: "Devolução",
  cancelamento: "Cancelamento",
};

export const TIPOS_MOVIMENTACAO: TipoMovimentacaoCaixa[] = [
  "venda",
  "recebimento_parcela",
  "entrada",
  "saida",
  "devolucao",
  "cancelamento",
];

export type OrigemMovimentacao = "venda" | "parcela" | "manual" | "devolucao" | "cancelamento";

export const LABEL_ORIGEM_MOVIMENTACAO: Record<OrigemMovimentacao, string> = {
  venda: "Venda",
  parcela: "Parcela",
  manual: "Ajuste manual",
  devolucao: "Devolução",
  cancelamento: "Cancelamento",
};

/** Forma de pagamento — as opções vivem em Configurações (`FORMAS_PAGAMENTO`). */
export type FormaPagamento = string;

/** Movimentação financeira — registro imutável após criado. */
export interface MovimentacaoCaixa {
  id: string;
  caixaId: string;
  /** Data/hora em ISO. */
  dataHora: string;
  tipo: TipoMovimentacaoCaixa;
  origem: OrigemMovimentacao;
  descricao: string;
  /** Referência humana (código da venda, parcela, motivo…). */
  referencia: string | null;
  /** Venda de origem, quando houver — habilita a navegação para /vendas/:id. */
  vendaId: string | null;
  vendaCodigo: string | null;
  formaPagamento: FormaPagamento;
  /** Sempre positivo; o sinal é determinado por `sentido`. */
  valor: number;
  sentido: "entrada" | "saida";
  responsavelId: string | null;
  responsavelNome: string;
  observacao: string;
  /** Motivo obrigatório nas saídas manuais. */
  motivo: string | null;
}

export interface AberturaCaixa {
  dataHora: string;
  responsavelId: string | null;
  responsavelNome: string;
  valorInicial: number;
  observacao: string;
}

export interface FechamentoCaixa {
  dataHora: string;
  responsavelId: string | null;
  responsavelNome: string;
  /** Valor contado fisicamente na gaveta. */
  valorInformado: number;
  /** Saldo que o sistema esperava no momento do fechamento. */
  valorEsperado: number;
  /** `valorInformado - valorEsperado`: > 0 sobra, < 0 falta. */
  diferenca: number;
  observacao: string;
}

/** Consolidação financeira do caixa — sempre calculada pela camada de dados. */
export interface ResumoCaixa {
  valorAbertura: number;
  /** Recebido à vista nas vendas do caixa. */
  totalVendas: number;
  /** Baixas de parcelas recebidas neste caixa. */
  recebimentos: number;
  entradasManuais: number;
  totalEntradas: number;
  saidasManuais: number;
  devolucoes: number;
  totalSaidas: number;
  /** abertura + entradas − saídas. */
  saldoEsperado: number;
  quantidadeVendas: number;
  quantidadeMovimentacoes: number;
}

export interface Caixa {
  id: string;
  /** Código sequencial gerado pela API (`CAIXA-0001`). Nunca editável. */
  codigo: string;
  status: CaixaStatus;
  abertura: AberturaCaixa;
  fechamento: FechamentoCaixa | null;
  resumo: ResumoCaixa;
}

/** Recebimento de fiado: baixa de parcela ocorrida dentro do caixa. */
export interface RecebimentoCaixa {
  id: string;
  dataHora: string;
  vendaId: string;
  vendaCodigo: string;
  clienteNome: string;
  parcelaNumero: number;
  parcelaTotal: number;
  vencimento: string;
  valor: number;
  formaPagamento: FormaPagamento;
  responsavelNome: string;
}

export interface CaixaDetalhe extends Caixa {
  movimentacoes: MovimentacaoCaixa[];
  vendas: VendaResumo[];
  recebimentos: RecebimentoCaixa[];
}

export interface CaixaEstatisticas {
  caixasAbertos: number;
  caixasFechados: number;
  /** Entradas do dia corrente somando todos os caixas. */
  entradasHoje: number;
  saidasHoje: number;
  vendasHoje: number;
  recebimentosHoje: number;
  devolucoesHoje: number;
  saldoEsperadoAtual: number;
  diferencaAcumulada: number;
}

export interface AberturaCaixaPayload {
  responsavelId: string | null;
  valorInicial: number;
  observacao?: string | undefined;
}

export interface EntradaCaixaPayload {
  descricao: string;
  valor: number;
  formaPagamento: FormaPagamento;
  responsavelId?: string | null | undefined;
  observacao?: string | undefined;
}

export interface SaidaCaixaPayload extends EntradaCaixaPayload {
  /** Obrigatório: toda retirada precisa de motivo auditável. */
  motivo: string;
}

export interface FechamentoCaixaPayload {
  valorInformado: number;
  responsavelId?: string | null | undefined;
  /** Obrigatório quando existir diferença de caixa. */
  observacao?: string | undefined;
}

/** Motivos sugeridos nas movimentações manuais. */
export const MOTIVOS_ENTRADA = [
  "Troco inicial adicional",
  "Suprimento",
  "Ajuste",
  "Outros",
] as const;

export const MOTIVOS_SAIDA = [
  "Compra emergencial",
  "Material de limpeza",
  "Pequenas despesas",
  "Retirada",
  "Outros",
] as const;
