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
export type FiltroDisponibilidade = "todos" | "disponivel" | "sem-estoque";

/**
 * Etapa 18.32 — os filtros singulares (`categoria`, `colecaoId`, `campanhaId`,
 * `fornecedorId`, `disponibilidade`) foram removidos: o backend real rejeita
 * esses parâmetros com 400 (`ListarProdutosQueryDto` só aceita a seleção em
 * CSV/plural — `categorias`, `colecoes`, `campanhas`, `fornecedores`,
 * `estoque` —, já coberta por `facetas`/`selecaoParaQuery`). Confirmado que
 * nenhuma tela chegou a popular esses campos (dead code desde sempre).
 *
 * Etapa 5.1 (validação pré-corte) — pelo mesmo motivo, `promocao`/`novidade`
 * de nível superior (antigo tipo `FiltroBooleano`, valores `sim`/`nao`) foram
 * removidos daqui: nenhuma tela populava esses campos (dead code), e o
 * backend real só reconhece esses dois filtros dentro do esquema de facetas
 * (`facetas.promocao`/`facetas.novidade`, valores `promocao`/`sem_promocao`
 * e `novidade`/`sem_novidade` — ver `FACETAS_PRODUTO` em
 * `src/lib/filtros/produtos-facetas.ts`, já correto, já em uso pela tela real
 * desde sempre).
 */
export interface ProdutoFiltros {
  /** Seleção multivalorada das facetas (`{ categorias: ["Vestidos"] }`). */
  facetas?: SelecaoFacetas | undefined;
  busca?: string | undefined;
  ordenarPor?: OrdenarProdutoPor | undefined;
  ordem?: Ordem | undefined;
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
