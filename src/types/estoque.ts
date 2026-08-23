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

/** Distribuição do estoque de uma cor (variante) por tamanho. */
export interface EstoqueCorResumo {
  varianteId: string;
  cor: string;
  quantidade: number;
  tamanhos: { id: string; tamanho: string; quantidade: number }[];
}

export interface ResumoEstoqueProduto {
  produtoId: string;
  codProduto: string;
  nome: string;
  categoria: string;
  foto: string | null;
  /** Todas as fotos do produto (uma por variante) para a miniatura com carrossel. */
  fotos: string[];
  /** Cores disponíveis com os tamanhos e quantidades de cada uma. */
  cores: EstoqueCorResumo[];
  /** Referência à coleção do produto (nome resolvido na UI). */
  colecaoId?: string | null;
  /** Referência à campanha do produto (nome resolvido na UI). */
  campanhaId?: string | null;
  quantidadeTotal: number;
  totalVariantes: number;
  estoqueZeradoEm?: string | null;
}
