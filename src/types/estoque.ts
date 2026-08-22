export interface EntradaEstoqueRequest {
  produtoId: string;
  varianteId: string;
  /** Informe tamanhoId para somar em um tamanho existente. */
  tamanhoId?: string | undefined;
  /** Informe tamanho para criar um novo tamanho na variante. */
  tamanho?: string | undefined;
  quantidade: number;
}

export interface SaidaEstoqueRequest {
  produtoId: string;
  varianteId: string;
  tamanhoId: string;
  quantidade: number;
  motivo: string;
}

export interface ResumoEstoqueProduto {
  produtoId: string;
  codProduto: string;
  nome: string;
  categoria: string;
  foto: string | null;
  quantidadeTotal: number;
  totalVariantes: number;
  estoqueZeradoEm?: string | null;
}
