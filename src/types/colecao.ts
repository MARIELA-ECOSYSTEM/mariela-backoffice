import type { SelecaoFacetas } from "@/lib/filtros/facetas";

export interface Colecao {
  id: string;
  /** Código sequencial gerado pela API (`COL-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  descricao: string;
  /** Início da coleção em ISO (YYYY-MM-DD). */
  inicio: string;
  /** Fim da coleção em ISO (YYYY-MM-DD). */
  fim: string;
  ativo: boolean;
  /** Marcada para aparecer em áreas de destaque (futuro Mariela Vitrine Virtual). */
  destaque: boolean;
  /** Marcada para aparecer em banners/hero sections da vitrine. */
  banner: boolean;
  /** Imagem editorial usada em cards e destaques. */
  fotoDestaque: string | null;
  /** Imagem horizontal usada em banners/hero. */
  fotoBanner: string | null;
  criadoEm: string;
  atualizadoEm: string;
  /** Quantidade de produtos atualmente vinculados (agregado da API). */
  produtosVinculados: number;
}

export interface ColecaoPayload {
  nome: string;
  descricao?: string | undefined;
  inicio: string;
  fim: string;
  ativo: boolean;
  destaque?: boolean | undefined;
  banner?: boolean | undefined;
  fotoDestaque?: string | undefined;
  fotoBanner?: string | undefined;
}

export type OrdenarColecaoPor = "nome" | "criadoEm" | "inicio" | "fim";
export type Ordem = "asc" | "desc";

/**
 * Espelha exatamente `ListarColecoesQueryDto` do backend
 * (`backend/src/modules/colecoes/dto/listar-colecoes-query.dto.ts`): `busca`
 * + `ordenarPor`/`ordem` + a seleção de facetas em CSV (`situacao`,
 * `destaque`, `banner`, `produtos`) + `page`/`limit`.
 */
export interface ColecaoFiltros {
  /** Seleção multivalorada das facetas (`{ situacao: ["ativa"] }`). */
  facetas?: SelecaoFacetas | undefined;
  busca?: string | undefined;
  ordenarPor?: OrdenarColecaoPor | undefined;
  ordem?: Ordem | undefined;
  /** Página solicitada (1-based). Ausente = página 1 (ver `PAGINA_PADRAO_COLECOES`). */
  page?: number | undefined;
  /** Itens por página. Ausente = 20 (ver `LIMITE_PADRAO_COLECOES`), máximo 100 (limite do backend). */
  limit?: number | undefined;
}

/** Paginação real, sempre devolvida pelo backend para `GET /colecoes` — nunca calculada no cliente. */
export interface ColecoesMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
