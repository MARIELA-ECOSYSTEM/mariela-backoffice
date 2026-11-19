export interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  [key: string]: unknown;
}

/** Opção de faceta (filtro) com a contagem calculada pela camada de dados. */
export interface FacetOption {
  valor: string;
  count: number;
}

/**
 * Contagens de filtros por grupo, no formato do contrato da API:
 * `{ categorias: [{ valor, count }], estoque: [{ valor, count }] }`.
 */
export type ApiFacets = Record<string, FacetOption[]>;

export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
  /** Contagens dos filtros referentes ao conjunto COMPLETO (não à página). */
  facets?: ApiFacets;
}

/** Resposta paginada com facets — contrato usado pelas listagens. */
export type PaginatedResponse<T> = ApiResponse<T[]>;

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  errors?: ApiFieldError[];
  /**
   * Fase 22.8.9.9.2 (M2) — segundos indicados por `Retry-After` numa resposta 429, quando o cabeçalho é legível.
   * Numa requisição de outra origem (o app desktop), o navegador só expõe o cabeçalho se o backend o listar em
   * `Access-Control-Expose-Headers`; sem isso fica `null` e quem trata o 429 usa a janela conhecida do limite.
   */
  retryAfterSegundos?: number | null;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly errors: ApiFieldError[];
  /** Fase 22.8.9.9.2 (M2) — ver `ApiErrorPayload.retryAfterSegundos`. */
  readonly retryAfterSegundos: number | null;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.errors = payload.errors ?? [];
    this.retryAfterSegundos = payload.retryAfterSegundos ?? null;
  }

  static validation(message: string, errors: ApiFieldError[] = []): ApiError {
    return new ApiError({ statusCode: 400, code: "VALIDATION_ERROR", message, errors });
  }

  static notFound(message = "Registro não encontrado."): ApiError {
    return new ApiError({ statusCode: 404, code: "NOT_FOUND", message });
  }

  static unauthorized(message = "Credenciais inválidas."): ApiError {
    return new ApiError({ statusCode: 401, code: "UNAUTHORIZED", message });
  }

  static conflict(message: string): ApiError {
    return new ApiError({ statusCode: 409, code: "CONFLICT", message });
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;
