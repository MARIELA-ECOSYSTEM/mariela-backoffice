import type { Variante } from "./variante";

export interface Produto {
  id: string;
  codProduto: string;
  nome: string;
  descricao?: string;
  categoria: string;
  colecaoId?: string | null;
  campanhaId?: string | null;
  fornecedorId?: string | null;
  precoCusto: number;
  margemLucro: number;
  precoVenda: number;
  ehNovidade: boolean;
  ehPromocao: boolean;
  precoPromocional?: number | null;
  quantidadeTotal: number;
  estoqueZeradoEm?: string | null;
  variantes: Variante[];
  criadoEm: string;
  atualizadoEm: string;
}

export interface ProdutoPayload {
  codProduto: string;
  nome: string;
  descricao?: string;
  categoria: string;
  colecaoId?: string | null;
  campanhaId?: string | null;
  fornecedorId?: string | null;
  precoCusto: number;
  precoVenda: number;
  ehNovidade: boolean;
}

export type OrdenarProdutoPor = "nome" | "codProduto" | "precoVenda" | "quantidadeTotal" | "criadoEm";
export type Ordem = "asc" | "desc";
export type FiltroDisponibilidade = "todos" | "disponivel" | "sem-estoque";
export type FiltroBooleano = "todos" | "sim" | "nao";

export interface ProdutoFiltros {
  busca?: string;
  categoria?: string;
  colecaoId?: string;
  campanhaId?: string;
  fornecedorId?: string;
  disponibilidade?: FiltroDisponibilidade;
  promocao?: FiltroBooleano;
  novidade?: FiltroBooleano;
  ordenarPor?: OrdenarProdutoPor;
  ordem?: Ordem;
}

export interface PromocaoRequest {
  ehPromocao: boolean;
  precoPromocional?: number | null;
}
