/**
 * Contratos de relatórios preparados para a futura API NestJS.
 * `demonstracao: true` sinaliza que os números vêm de dados de demonstração.
 */
export interface RelatorioSerie {
  label: string;
  valor: number;
}

export interface ResumoRelatorios {
  demonstracao: boolean;
  geradoEm: string;
  totalProdutos: number;
  totalVariantes: number;
  pecasEmEstoque: number;
  produtosSemEstoque: number;
  valorCustoEstoque: number;
  valorVendaEstoque: number;
  margemMediaPercentual: number;
  produtosPorCategoria: RelatorioSerie[];
  pecasPorCategoria: RelatorioSerie[];
  topEstoque: RelatorioSerie[];
  cadastrosPorMes: RelatorioSerie[];
}
