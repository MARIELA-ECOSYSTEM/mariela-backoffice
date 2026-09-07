import { ApiError, type ApiResponse, type QueryParams } from "@/types/api";
import type { SessaoResponse } from "@/types/auth";
import { handleMockRequest } from "@/services/mock/mock-transport";
import { tokenStorage } from "@/services/auth/token-storage";
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

/**
 * Rotas de autenticação NUNCA disparam o mecanismo de renovação automática:
 * `/auth/login` e `/auth/refresh` já são o próprio mecanismo (um 401 ali é o
 * resultado final, não um gatilho para tentar de novo — senão vira um loop
 * infinito de refresh chamando refresh). `/auth/logout` também fica de fora:
 * não precisa de um access token válido para funcionar (ver `authApi.logout`).
 */
const ENDPOINTS_SEM_RENOVACAO_AUTOMATICA = ["/auth/login", "/auth/refresh", "/auth/logout"];

function precisaRenovacaoAutomatica(path: string): boolean {
  return !ENDPOINTS_SEM_RENOVACAO_AUTOMATICA.some((rota) => path.startsWith(rota));
}

/** Leitura/escrita do access token sempre via abstração `TokenStorage`. */
export function getAccessToken(): string | null {
  return tokenStorage.getAccessToken();
}

export function setAccessToken(token: string): void {
  tokenStorage.setAccessToken(token);
}

export function getRefreshToken(): string | null {
  return tokenStorage.getRefreshToken();
}

export function setRefreshToken(token: string): void {
  tokenStorage.setRefreshToken(token);
}

/** Limpa a sessão inteira (os dois tokens) — usado no logout e em falha irrecuperável de renovação. */
export function limparSessaoLocal(): void {
  tokenStorage.clear();
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

async function enviar<T>(request: ApiRequest): Promise<ApiResponse<T>> {
  return USE_MOCK_API ? handleMockRequest<T>(request) : httpRequest<T>(request);
}

/**
 * Garante UMA única renovação em voo mesmo quando várias requisições batem
 * 401 ao mesmo tempo: a primeira chamada cria a promise e a guarda aqui; toda
 * chamada concorrente recebe a MESMA promise em vez de disparar um novo
 * `/auth/refresh` — sem isso, N requisições simultâneas expiradas
 * significariam N chamadas de refresh, cada uma tentando rotacionar o mesmo
 * refresh token (e todas menos a primeira falhariam com REFRESH_TOKEN_REUSED).
 */
let renovacaoEmAndamento: Promise<SessaoResponse> | null = null;

async function renovarSessao(): Promise<SessaoResponse> {
  if (renovacaoEmAndamento) return renovacaoEmAndamento;

  renovacaoEmAndamento = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      throw new ApiError({
        statusCode: 401,
        code: "REFRESH_TOKEN_INVALID",
        message: "Sessão expirada. Faça login novamente.",
      });
    }

    const resposta = await enviar<SessaoResponse>({
      method: "POST",
      path: "/auth/refresh",
      params: {},
      body: { refreshToken },
      token: null,
    });

    setAccessToken(resposta.data.accessToken);
    setRefreshToken(resposta.data.refreshToken);
    return resposta.data;
  })();

  try {
    return await renovacaoEmAndamento;
  } finally {
    // Solta o mutex assim que a rodada atual termina (sucesso OU falha) —
    // a PRÓXIMA requisição que precisar renovar dispara uma nova tentativa.
    renovacaoEmAndamento = null;
  }
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
  jaTentouRenovar = false,
): Promise<ApiResponse<T>> {
  const apiRequest: ApiRequest = {
    method,
    path,
    params: options.params ?? {},
    body: options.body,
    token: getAccessToken(),
  };

  try {
    return await enviar<T>(apiRequest);
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 401) throw error;

    // Login: um 401 aqui é só "credenciais inválidas" — nunca dispara renovação.
    if (!precisaRenovacaoAutomatica(path)) throw error;

    if (jaTentouRenovar) {
      // Já tentamos renovar uma vez para ESTA requisição e ainda assim veio
      // 401 de novo — não insiste indefinidamente (ver §7: nunca criar loop).
      handleUnauthorized();
      throw error;
    }

    try {
      await renovarSessao();
    } catch (erroRenovacao) {
      // REFRESH_TOKEN_INVALID, REFRESH_TOKEN_REUSED, USER_INACTIVE, sem
      // refresh token salvo… qualquer falha de renovação = sessão encerrada.
      handleUnauthorized();
      throw erroRenovacao;
    }

    // Repete a requisição ORIGINAL exatamente uma vez, agora com o novo access token.
    return request<T>(method, path, options, true);
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
