import { ApiError, type ApiResponse, type QueryParams } from "@/types/api";
import { handleMockRequest } from "@/services/mock/mock-transport";

export const API_URL = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api/v1";
export const USE_MOCK_API =
  (import.meta.env["VITE_USE_MOCK_API"] as string | undefined) !== "false";
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
