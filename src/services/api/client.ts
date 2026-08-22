import { ApiError, type ApiResponse, type QueryParams } from "@/types/api";
import { handleMockRequest } from "@/services/mock/mock-transport";

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
export const TOKEN_STORAGE_KEY = "mariela.accessToken";

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

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
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

async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const apiRequest: ApiRequest = {
    method,
    path,
    params: options.params ?? {},
    body: options.body,
    token: getToken(),
  };

  if (USE_MOCK_API) {
    return handleMockRequest<T>(apiRequest);
  }
  return httpRequest<T>(apiRequest);
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
