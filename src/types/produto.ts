import type { SelecaoFacetas } from "@/lib/filtros/facetas";
import type { Variante } from "./variante";

export interface Produto {
  id: string;
  /** Código sequencial gerado pela API (`PROD-0001`). Somente leitura. */
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
  /**
   * Variante cuja foto é a imagem principal do produto (usada futuramente pela
   * MARIELA Vitrine Virtual). Quando nulo, vale a primeira foto cadastrada.
   */
  fotoPrincipalVarianteId?: string | null;
  estoqueZeradoEm?: string | null;
  variantes: Variante[];
  criadoEm: string;
  atualizadoEm: string;
}

/** O código NÃO faz parte do payload: quem gera é a API. */
export interface ProdutoPayload {
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
/** Usado pelo filtro (mais simples) da tela de Estoque — não pelo de Produtos, que usa facetas. */
export type FiltroDisponibilidade = "todos" | "disponivel" | "sem-estoque";

/**
 * Espelha exatamente `ListarProdutosQueryDto` do backend
 * (`backend/src/modules/produtos/dto/listar-produtos-query.dto.ts`):
 * `busca` + `ordenarPor`/`ordem` + a seleção de facetas em CSV + `page`/`limit`.
 * Os filtros "simples" (categoria única, `promocao=sim|nao`…) não existem mais
 * no contrato real da API — foram substituídos pelo esquema de facetas.
 */
export interface ProdutoFiltros {
  /** Seleção multivalorada das facetas (`{ categorias: ["Vestidos"] }`). */
  facetas?: SelecaoFacetas | undefined;
  busca?: string | undefined;
  ordenarPor?: OrdenarProdutoPor | undefined;
  ordem?: Ordem | undefined;
  /** Página solicitada (1-based). Ausente = página 1 (ver `PAGINA_PADRAO_PRODUTOS`). */
  page?: number | undefined;
  /** Itens por página. Ausente = 20 (ver `LIMITE_PADRAO_PRODUTOS`), máximo 100 (limite do backend). */
  limit?: number | undefined;
}

/** Paginação real, sempre devolvida pelo backend para `GET /produtos` — nunca calculada no cliente. */
export interface ProdutosMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FotoPrincipalRequest {
  /** Id da variante cuja foto passa a ser a imagem principal. */
  varianteId: string | null;
}

export interface PromocaoRequest {
  ehPromocao: boolean;
  precoPromocional?: number | null;
}

export interface NovidadeRequest {
  ehNovidade: boolean;
}
