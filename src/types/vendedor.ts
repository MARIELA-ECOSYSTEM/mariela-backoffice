import type { SelecaoFacetas } from "@/lib/filtros/facetas";

export interface Vendedor {
  id: string;
  /** Código sequencial gerado pela API (`VEN-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  /** URL da foto do vendedor ou null. */
  foto: string | null;
  /** Telefone único — usado também como WhatsApp. */
  telefone: string;
  /** Data de nascimento em ISO (YYYY-MM-DD) ou null. */
  dataNascimento: string | null;
  observacao: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  /**
   * Agregados de vendas calculados pela camada de dados (hoje mock, amanhã
   * NestJS). O frontend NUNCA recalcula isso somando vendas no componente.
   */
  vendas: number;
  totalVendido: number;
  /** Data ISO da venda mais recente ou null quando nunca vendeu. */
  ultimaVenda: string | null;
}

export interface VendedorPayload {
  nome: string;
  foto?: string | null | undefined;
  telefone: string;
  dataNascimento?: string | null | undefined;
  observacao?: string | undefined;
  ativo: boolean;
  /** Senha em texto plano enviada à API, que gera o hash. Nunca é retornada. */
  senha?: string | undefined;
}

export interface VendedorStatusPayload {
  ativo: boolean;
}

export interface VendedorSenhaPayload {
  senha: string;
}

export type OrdenarVendedorPor =
  "nome" | "vendas" | "totalVendido" | "ultimaVenda" | "dataNascimento" | "criadoEm";
export type Ordem = "asc" | "desc";

/**
 * Espelha exatamente `ListarVendedoresQueryDto` do backend
 * (`backend/src/modules/vendedores/dto/listar-vendedores-query.dto.ts`): `busca`
 * + `ordenarPor`/`ordem` + a seleção de facetas em CSV (`status`, `vendas`,
 * `valor`, `ultimaVenda`, `nascimento`, `observacao`) + `page`/`limit`.
 */
export interface VendedorFiltros {
  /** Seleção multivalorada das facetas (`{ status: ["ativos"] }`). */
  facetas?: SelecaoFacetas | undefined;
  busca?: string | undefined;
  ordenarPor?: OrdenarVendedorPor | undefined;
  ordem?: Ordem | undefined;
  /** Página solicitada (1-based). Ausente = página 1 (ver `PAGINA_PADRAO_VENDEDORES`). */
  page?: number | undefined;
  /** Itens por página. Ausente = 20 (ver `LIMITE_PADRAO_VENDEDORES`), máximo 100 (limite do backend). */
  limit?: number | undefined;
}

/** Paginação real, sempre devolvida pelo backend para `GET /vendedores` — nunca calculada no cliente. */
export interface VendedoresMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
