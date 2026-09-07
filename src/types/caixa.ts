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
 * Endpoints (implementados pela API NestJS):
 *   GET  /caixas                        → PaginatedResponse<Caixa> (busca+facetas+ordenação, server-side)
 *   GET  /caixas/atual                  → ApiResponse<CaixaDetalhe | null>
 *   GET  /caixas/estatisticas           → ApiResponse<CaixaEstatisticas>
 *   GET  /caixas/:id                    → ApiResponse<CaixaDetalhe> (`movimentacoes` = só as mais recentes)
 *   POST /caixas                        → ApiResponse<CaixaDetalhe>
 *   POST /caixas/:id/entrada            → ApiResponse<CaixaDetalhe>
 *   POST /caixas/:id/saida              → ApiResponse<CaixaDetalhe>
 *   GET  /caixas/:id/movimentacoes      → PaginatedResponse<MovimentacaoCaixa> (histórico completo, paginado)
 *   GET  /caixas/:id/vendas             → ApiResponse<VendaResumo[]> (sempre vazio até Vendas existir)
 *   GET  /caixas/:id/recebimentos       → ApiResponse<RecebimentoCaixa[]> (sempre vazio até Vendas existir)
 *   POST /caixas/:id/fechamento         → ApiResponse<CaixaDetalhe>
 */
import type { SelecaoFacetas } from "@/lib/filtros/facetas";
import type { VendaResumo } from "./venda";

export type CaixaStatus = "aberto" | "fechado";

export const LABEL_STATUS_CAIXA: Record<CaixaStatus, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
};

export const STATUS_CAIXA: CaixaStatus[] = ["aberto", "fechado"];

export type TipoMovimentacaoCaixa =
  "venda" | "recebimento_parcela" | "entrada" | "saida" | "devolucao" | "cancelamento";

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
  /** Repetir a mesma chave para o mesmo caixa devolve o movimento já criado, sem duplicar (protege contra retry). */
  idempotencyKey?: string | undefined;
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

export type OrdenarCaixaPor = "data" | "faturamento" | "saldo" | "diferenca" | "vendas";
export type Ordem = "asc" | "desc";

/**
 * Espelha exatamente `ListarCaixasQueryDto` do backend
 * (`backend/src/modules/caixas/dto/listar-caixas-query.dto.ts`): `busca` +
 * `ordenarPor`/`ordem` + a seleção de facetas em CSV (`status`, `periodo`,
 * `responsavel`, `diferenca`, `saldo`) + `page`/`limit`.
 */
export interface CaixaFiltros {
  facetas?: SelecaoFacetas | undefined;
  busca?: string | undefined;
  ordenarPor?: OrdenarCaixaPor | undefined;
  ordem?: Ordem | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

/** Paginação real, sempre devolvida pelo backend para `GET /caixas` — nunca calculada no cliente. */
export interface CaixasMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Filtros do histórico paginado de movimentações de UM caixa (`GET /caixas/:id/movimentacoes`). */
export interface MovimentosCaixaFiltros {
  tipo?: TipoMovimentacaoCaixa[] | undefined;
  responsavelId?: string | undefined;
  ordem?: Ordem | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface MovimentosCaixaMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
