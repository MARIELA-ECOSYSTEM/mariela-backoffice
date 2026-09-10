/**
 * Contratos do módulo CAIXA do MARIELA BACKOFFICE.
 *
 * Etapa 18.6 — alinhado ao domínio definitivo do backend (Etapas 18.2-18.5):
 * o Caixa é um CAIXA GERAL DA LOJA (não há caixa por vendedor), sem vínculo
 * de responsável/vendedor, com exatamente 4 tipos de movimento. Vendedor
 * pertence exclusivamente à Venda — quando o Caixa exibe uma venda (`vendas`
 * em `CaixaDetalhe`), o vendedor vem de `VendaResumo`, nunca de um campo do
 * próprio Caixa/movimento.
 *
 * Regras vigentes:
 * 1. Somente o valor EFETIVAMENTE RECEBIDO entra no caixa. Uma venda
 *    EM_PAGAMENTO não lança o valor pendente.
 * 2. Recebimento posterior de parcela é só mais um movimento `tipo: "venda"`
 *    (o Caixa não distingue mais "à vista" de "baixa de parcela").
 * 3. Cancelamento/devolução (parcial ou total) gera um movimento
 *    `tipo: "cancelamento"` com o valor já calculado por Vendas.
 * 4. Caixa FECHADO é histórico imutável: não há PUT/DELETE de movimentações.
 *    Correções futuras nascem de uma nova movimentação de ajuste.
 * 5. O saldo PODE ficar negativo: sangria e cancelamento nunca são bloqueados
 *    por saldo insuficiente, e o fechamento aceita `valorInformado` negativo.
 *    O backend é sempre a autoridade sobre saldo/valorEsperado/diferença.
 *
 * Endpoints realmente consumidos:
 *   GET  /caixas                        → PaginatedResponse<Caixa> (ou array completo sem params)
 *   GET  /caixas/atual                  → ApiResponse<Caixa | null>
 *   GET  /caixas/estatisticas           → ApiResponse<CaixaEstatisticas>
 *   GET  /caixas/:id                    → ApiResponse<CaixaDetalhe>
 *   GET  /caixas/:id/movimentacoes      → ApiResponse<MovimentacaoCaixa[]>
 *   POST /caixas                        → ApiResponse<CaixaDetalhe>
 *   POST /caixas/:id/entrada            → ApiResponse<CaixaDetalhe>
 *   POST /caixas/:id/saida              → ApiResponse<CaixaDetalhe>
 *   POST /caixas/:id/fechamento         → ApiResponse<CaixaDetalhe>
 *
 * `GET /caixas/:id/vendas` e `GET /caixas/:id/recebimentos` NÃO existem no
 * backend (removidos na Etapa 18.2) — as vendas do caixa vêm embutidas em
 * `CaixaDetalhe.vendas`, projeção de Vendas.
 */
import type { VendaResumo } from "./venda";

export type CaixaStatus = "aberto" | "fechado";

export const LABEL_STATUS_CAIXA: Record<CaixaStatus, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
};

export const STATUS_CAIXA: CaixaStatus[] = ["aberto", "fechado"];

/** Os 4 únicos tipos de movimento do Caixa Geral da Loja (Etapa 18.2). */
export type TipoMovimentacaoCaixa = "injecao" | "sangria" | "venda" | "cancelamento";

export const LABEL_TIPO_MOVIMENTACAO: Record<TipoMovimentacaoCaixa, string> = {
  injecao: "Injeção",
  sangria: "Sangria",
  venda: "Venda",
  cancelamento: "Cancelamento",
};

export const TIPOS_MOVIMENTACAO: TipoMovimentacaoCaixa[] = [
  "injecao",
  "sangria",
  "venda",
  "cancelamento",
];

export type OrigemMovimentacao = "manual" | "venda" | "cancelamento";

export const LABEL_ORIGEM_MOVIMENTACAO: Record<OrigemMovimentacao, string> = {
  manual: "Ajuste manual",
  venda: "Venda",
  cancelamento: "Cancelamento",
};

/** Forma de pagamento — as opções vivem em Configurações (`FORMAS_PAGAMENTO`). */
export type FormaPagamento = string;

/**
 * Movimentação financeira — registro imutável após criado. Etapa 18.6: sem
 * `responsavelId`/`responsavelNome` — o Caixa não tem vínculo de vendedor em
 * nenhum nível, incluindo o do movimento individual (o backend não envia mais
 * esses campos desde a Etapa 18.2). Quando o movimento é `venda`/`cancelamento`,
 * quem quiser saber o vendedor consulta `vendaId` → `VendaResumoDoCaixa`.
 */
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
  observacao: string;
  /** Motivo obrigatório nas saídas manuais. */
  motivo: string | null;
}

/**
 * `responsavelId`/`responsavelNome` continuam existindo só aqui (abertura e
 * fechamento do Caixa como um todo, nunca no movimento individual) porque o
 * backend efetivamente os devolve na resposta pública por compatibilidade de
 * tela (sempre `null`/`"Loja"` — não é um vínculo de vendedor real, ver
 * `caixas.service.ts` do backend). O Backoffice ainda os EXIBE (badge/filtro
 * de "Responsável" em `caixa.index.tsx`/`caixa.$id.tsx`/`caixa-card.tsx`),
 * mas não envia mais `responsavelId` em nenhum payload (Etapa 18.6 — ver
 * `AberturaCaixaPayload`/`EntradaCaixaPayload`/`FechamentoCaixaPayload`).
 */
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

/**
 * Etapa 18.2 (backend) / 18.6 (frontend) — o conceito de "recebimento" como
 * tipo de movimento distinto de "venda" foi abolido do domínio do Caixa; o
 * backend sempre devolve `CaixaDetalhe.recebimentos` vazio (ver
 * `CaixaDetalheResposta.recebimentos: never[]` em `caixas.service.ts`).
 * Este tipo NÃO é reintroduzido como conceito de domínio — existe só porque
 * `caixa.$id.tsx` ("Recebimentos de fiado") ainda desestrutura os campos de
 * cada item num `.map()`, e um array sempre vazio ainda precisa de um
 * elemento tipado para essa leitura continuar compilando sem reescrever a
 * tela (fora do escopo desta etapa — não redesenhar telas).
 */
export interface ItemRecebimentoLegado {
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
  /** Sempre `[]` na prática (ver `ItemRecebimentoLegado`). */
  recebimentos: ItemRecebimentoLegado[];
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

/**
 * Etapa 18.6 — nenhum payload do Caixa envia `responsavelId`: o backend até
 * aceita o campo por compatibilidade (Etapas 18.2/18.5), mas ignora
 * completamente, e o Caixa não tem vínculo de vendedor/responsável. O
 * Backoffice para de enviá-lo para refletir o contrato conceitual real, sem
 * depender de uma remoção do backend.
 */
export interface AberturaCaixaPayload {
  valorInicial: number;
  observacao?: string | undefined;
}

export interface EntradaCaixaPayload {
  descricao: string;
  valor: number;
  formaPagamento: FormaPagamento;
  observacao?: string | undefined;
}

export interface SaidaCaixaPayload extends EntradaCaixaPayload {
  /** Obrigatório: toda retirada precisa de motivo auditável. */
  motivo: string;
}

export interface FechamentoCaixaPayload {
  valorInformado: number;
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
