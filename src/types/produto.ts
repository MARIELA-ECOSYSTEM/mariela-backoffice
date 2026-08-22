import type { SelecaoFacetas } from "@/lib/filtros/facetas";
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
  descricao?: string | undefined;
  categoria: string;
  colecaoId?: string | null | undefined;
  campanhaId?: string | null | undefined;
  fornecedorId?: string | null | undefined;
  precoCusto: number;
  precoVenda: number;
  ehNovidade: boolean;
}

export type OrdenarProdutoPor =
  "nome" | "codProduto" | "precoVenda" | "quantidadeTotal" | "criadoEm";
export type Ordem = "asc" | "desc";
export type FiltroDisponibilidade = "todos" | "disponivel" | "sem-estoque";
export type FiltroBooleano = "todos" | "sim" | "nao";

export interface ProdutoFiltros {
  /** Seleção multivalorada das facetas (`{ categorias: ["Vestidos"] }`). */
  facetas?: SelecaoFacetas | undefined;
  busca?: string | undefined;
  categoria?: string | undefined;
  colecaoId?: string | undefined;
  campanhaId?: string | undefined;
  fornecedorId?: string | undefined;
  disponibilidade?: FiltroDisponibilidade | undefined;
  promocao?: FiltroBooleano | undefined;
  novidade?: FiltroBooleano | undefined;
  ordenarPor?: OrdenarProdutoPor | undefined;
  ordem?: Ordem | undefined;
}

export interface PromocaoRequest {
  ehPromocao: boolean;
  precoPromocional?: number | null;
}
