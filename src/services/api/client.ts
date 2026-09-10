import { ApiError, type ApiResponse, type QueryParams } from "@/types/api";
import { handleMockRequest } from "@/services/mock/mock-transport";
import {
  limparSessao,
  obterExpiraEm,
  refreshTokenStorage,
  salvarSessao,
  tokenStorage,
  TOKEN_STORAGE_KEY,
} from "@/services/auth/token-storage";
import { handleUnauthorized } from "@/services/auth/session";

/**
 * Endereço remoto da API REST (NestJS). Configurado exclusivamente por ambiente
 * — nunca embutir host fixo (localhost, IP da loja) no código.
 *   .env  →  VITE_API_URL=https://api.mariela.com/api/v1
 */
const API_URL_ENV = (import.meta.env["VITE_API_URL"] as string | undefined)?.trim();
const MOCK_ENV = (import.meta.env["VITE_USE_MOCK_API"] as string | undefined)?.trim();

export const API_URL = (API_URL_ENV ?? "").replace(/\/+$/, "");
/** Mock só é usado quando pedido explicitamente ou quando não há API configurada. */
export const USE_MOCK_API = MOCK_ENV === "true" || (MOCK_ENV !== "false" && API_URL === "");
export const REQUEST_TIMEOUT_MS = 15_000;
export { TOKEN_STORAGE_KEY };

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  params?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiRequest {
  method: HttpMethod;
  path: string;
  params: QueryParams;
  body: unknown;
  token: string | null;
}

/** Leitura/escrita do token sempre via abstração `TokenStorage`. */
export function getToken(): string | null {
  return tokenStorage.get();
}

export function setToken(token: string | null): void {
  if (token) tokenStorage.set(token);
  else tokenStorage.clear();
}

function buildQueryString(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function httpRequest<T>(request: ApiRequest): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${request.path}${buildQueryString(request.params)}`, {
      method: request.method,
      headers: {
        "content-type": "application/json",
        ...(request.token ? { authorization: `Bearer ${request.token}` } : {}),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const parsed = (payload ?? {}) as Partial<{
        code: string;
        message: string;
        errors: { field: string; message: string }[];
      }>;
      throw new ApiError({
        statusCode: response.status,
        code: parsed.code ?? "HTTP_ERROR",
        message: parsed.message ?? "Não foi possível completar a requisição.",
        errors: parsed.errors ?? [],
      });
    }

    return payload as ApiResponse<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError({
        statusCode: 408,
        code: "TIMEOUT",
        message: "A requisição excedeu o tempo limite.",
      });
    }
    throw new ApiError({
      statusCode: 0,
      code: "NETWORK_ERROR",
      message: "Falha de conexão com o servidor.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Rotas de autenticação nunca disparam renovação (evita loop) nem o tratamento global de 401. */
function ehRotaDeAutenticacao(path: string): boolean {
  return path.startsWith("/auth/login") || path.startsWith("/auth/refresh") || path.startsWith("/auth/logout");
}

/** Margem de segurança: renova um pouco ANTES do vencimento exato, nunca depois. */
const MARGEM_RENOVACAO_MS = 10_000;

function tokenProximoOuJaExpirado(): boolean {
  const expiraEm = obterExpiraEm();
  if (expiraEm === null) return false; // sem sessão rastreada — nada a renovar.
  return Date.now() + MARGEM_RENOVACAO_MS >= expiraEm;
}

interface ResultadoRenovacao {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Renovação DEDUPLICADA: múltiplas chamadas concorrentes (ex.: várias queries
 * do TanStack Query disparando perto da expiração) aguardam a MESMA promessa
 * em vez de cada uma rotacionar o refresh token — o backend só aceita UMA
 * rotação por vez (índice único/CAS); uma segunda tentativa com o token já
 * rotacionado seria tratada como REUSO e derrubaria a sessão inteira.
 */
let renovacaoEmAndamento: Promise<boolean> | null = null;

function renovarSessao(): Promise<boolean> {
  renovacaoEmAndamento ??= executarRenovacao().finally(() => {
    renovacaoEmAndamento = null;
  });
  return renovacaoEmAndamento;
}

async function executarRenovacao(): Promise<boolean> {
  const refreshToken = refreshTokenStorage.get();
  if (!refreshToken) return false;

  const requisicao: ApiRequest = { method: "POST", path: "/auth/refresh", params: {}, body: { refreshToken }, token: null };
  try {
    const resposta = USE_MOCK_API
      ? await handleMockRequest<ResultadoRenovacao>(requisicao)
      : await httpRequest<ResultadoRenovacao>(requisicao);
    salvarSessao(resposta.data);
    return true;
  } catch (error) {
    // Falha de rede/timeout é transitória — preserva a sessão local para tentar de novo depois.
    // Uma rejeição EXPLÍCITA do servidor (token inválido/revogado/reutilizado, usuário inativo)
    // significa que a sessão não é mais válida: limpa para não tentar de novo em vão.
    if (error instanceof ApiError && error.statusCode !== 0 && error.statusCode !== 408) {
      limparSessao();
    }
    return false;
  }
}

async function executarComTransporte<T>(apiRequest: ApiRequest): Promise<ApiResponse<T>> {
  return USE_MOCK_API ? await handleMockRequest<T>(apiRequest) : await httpRequest<T>(apiRequest);
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const renovavel = !ehRotaDeAutenticacao(path);

  // Renovação PROATIVA: evita a ida e volta extra de um 401 quando já se sabe
  // que o accessToken está vencido/perto de vencer.
  if (renovavel && tokenProximoOuJaExpirado()) {
    await renovarSessao();
  }

  const apiRequest: ApiRequest = {
    method,
    path,
    params: options.params ?? {},
    body: options.body,
    token: getToken(),
  };

  try {
    return await executarComTransporte<T>(apiRequest);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401 && renovavel) {
      // Renovação REATIVA: tenta UMA única vez (a deduplicação acima garante
      // isso mesmo sob concorrência) e refaz a MESMA requisição original.
      const renovou = await renovarSessao();
      if (renovou) {
        try {
          return await executarComTransporte<T>({ ...apiRequest, token: getToken() });
        } catch (erroRetentativa) {
          if (erroRetentativa instanceof ApiError && erroRetentativa.statusCode === 401) handleUnauthorized();
          throw erroRetentativa;
        }
      }
      // Renovação falhou (sem refresh token, ou rejeitado pelo servidor): a sessão acabou.
      handleUnauthorized();
    }
    throw error;
  }
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
};

export function mensagemDeErro(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
