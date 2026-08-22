import type { VendaResumo } from "./venda";

/**
 * Contratos do Dashboard preparados para a futura API NestJS
 * (`GET /dashboard/resumo?mes=YYYY-MM`).
 *
 * Todos os números são calculados no servidor a partir dos dados oficiais —
 * a UI nunca deriva métricas de negócio por conta própria.
 */
export interface MesReferencia {
  /** Formato YYYY-MM. */
  valor: string;
  /** Rótulo pronto para exibição (ex.: "agosto 2026"). */
  label: string;
}

export interface PontoEvolucaoVendas {
  /** Data do dia em ISO (YYYY-MM-DD). */
  data: string;
  /** Rótulo curto do dia (ex.: "01/08"). */
  label: string;
  vendas: number;
  faturamento: number;
}

export interface DashboardVendas {
  mesReferencia: string;
  mesLabel: string;
  mesesDisponiveis: MesReferencia[];
  vendasHoje: number;
  faturamentoHoje: number;
  vendasSemana: number;
  faturamentoSemana: number;
  vendasMes: number;
  faturamentoMes: number;
  ticketMedioMes: number;
  vendasMesAnterior: number;
  faturamentoMesAnterior: number;
  /** Variação percentual do faturamento em relação ao mês anterior. */
  crescimentoMensalPercentual: number;
  evolucao: PontoEvolucaoVendas[];
  ultimasVendas: VendaResumo[];
}

export interface DashboardEstoque {
  produtosCadastrados: number;
  variantesCadastradas: number;
  pecasEmEstoque: number;
  produtosSemEstoque: number;
  custoEstoque: number;
  /** Σ precoFinal × quantidade — valor de venda vigente do estoque. */
  vendaPotencial: number;
  lucroPotencial: number;
  margemMediaPercentual: number;
  ticketMedioEstoque: number;
}

export interface PessoaResumo {
  id: string;
  nome: string;
  foto: string | null;
  detalhe: string;
  ativo: boolean;
  criadoEm: string;
}

export interface DashboardClientes {
  cadastrados: number;
  ativos: number;
  inativos: number;
  novosNoMes: number;
  compraramNoMes: number;
  ticketMedioPorCliente: number;
  recentes: PessoaResumo[];
}

export interface DashboardFornecedores {
  cadastrados: number;
  ativos: number;
  inativos: number;
  recentes: PessoaResumo[];
}

export interface RankingVendedor {
  vendedorId: string;
  nome: string;
  foto: string | null;
  vendas: number;
  faturamento: number;
  ticketMedio: number;
}

export interface DashboardVendedores {
  cadastrados: number;
  ativos: number;
  inativos: number;
  ranking: RankingVendedor[];
}

export interface ResumoDashboard {
  /** Sinaliza que os números vêm de dados de demonstração. */
  demonstracao: boolean;
  geradoEm: string;
  vendas: DashboardVendas;
  estoque: DashboardEstoque;
  clientes: DashboardClientes;
  fornecedores: DashboardFornecedores;
  vendedores: DashboardVendedores;
}
