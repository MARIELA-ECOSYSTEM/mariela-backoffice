import type { SelecaoFacetas } from "@/lib/filtros/facetas";

export interface Cliente {
  id: string;
  /** Código sequencial gerado pela API (`CLI-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  /** URL da foto/avatar da cliente ou null. */
  foto: string | null;
  /** Telefone único do cliente — usado também como número de WhatsApp. */
  telefone: string;
  /** Data de nascimento em ISO (YYYY-MM-DD) ou null. */
  dataNascimento: string | null;
  observacao: string;
  criadoEm: string;
  atualizadoEm: string;
  /**
   * Agregados de compras calculados pelo backend (hoje pelo mock).
   * O frontend NUNCA deve recalcular isso somando vendas no componente.
   */
  compras: number;
  totalComprado: number;
  /** Data ISO da venda mais recente ou null quando nunca comprou. */
  ultimaCompra: string | null;
}

export interface ClientePayload {
  nome: string;
  foto?: string | null | undefined;
  telefone: string;
  dataNascimento?: string | null | undefined;
  observacao?: string | undefined;
}

export type OrdenarClientePor = "nome" | "compras" | "totalComprado" | "ultimaCompra" | "criadoEm";
export type Ordem = "asc" | "desc";

/**
 * Espelha exatamente `ListarClientesQueryDto` do backend
 * (`backend/src/modules/clientes/dto/listar-clientes-query.dto.ts`): `busca` +
 * `ordenarPor`/`ordem` + a seleção de facetas em CSV (`recencia`, `historico`,
 * `aniversario`, `observacao`) + `page`/`limit`.
 */
export interface ClienteFiltros {
  /** Seleção multivalorada das facetas (`{ historico: ["recorrente"] }`). */
  facetas?: SelecaoFacetas | undefined;
  busca?: string | undefined;
  ordenarPor?: OrdenarClientePor | undefined;
  ordem?: Ordem | undefined;
  /** Página solicitada (1-based). Ausente = página 1 (ver `PAGINA_PADRAO_CLIENTES`). */
  page?: number | undefined;
  /** Itens por página. Ausente = 20 (ver `LIMITE_PADRAO_CLIENTES`), máximo 100 (limite do backend). */
  limit?: number | undefined;
}

/** Paginação real, sempre devolvida pelo backend para `GET /clientes` — nunca calculada no cliente. */
export interface ClientesMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
