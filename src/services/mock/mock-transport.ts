import type { ApiRequest, HttpMethod } from "@/services/api/client";
import { ApiError, type ApiResponse, type QueryParams } from "@/types/api";

export interface MockContext {
  params: Record<string, string>;
  query: QueryParams;
  body: unknown;
  token: string | null;
}

export type MockHandler = (
  ctx: MockContext,
) => Promise<ApiResponse<unknown>> | ApiResponse<unknown>;

interface MockRoute {
  method: HttpMethod;
  segments: string[];
  handler: MockHandler;
  requiresAuth: boolean;
}

const routes: MockRoute[] = [];

export function registerMock(
  method: HttpMethod,
  pattern: string,
  handler: MockHandler,
  options: { requiresAuth?: boolean } = {},
): void {
  routes.push({
    method,
    segments: pattern.split("/").filter(Boolean),
    handler,
    requiresAuth: options.requiresAuth ?? true,
  });
}

function match(route: MockRoute, method: HttpMethod, path: string): Record<string, string> | null {
  if (route.method !== method) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== route.segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i += 1) {
    const expected = route.segments[i]!;
    const actual = segments[i]!;
    if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return params;
}

function delay(): Promise<void> {
  const ms = 100 + Math.floor(Math.random() * 300);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let registro: Promise<void> | null = null;
/**
 * Carrega e executa o registro das rotas mockadas uma única vez.
 * A chamada explícita de `registrarMocks()` é obrigatória: imports apenas por
 * efeito colateral são removidos no build de produção (`sideEffects: false`).
 */
function ensureRegistered(): Promise<void> {
  registro ??= import("./register").then(({ registrarMocks }) => {
    registrarMocks();
  });
  return registro;
}

export async function handleMockRequest<T>(request: ApiRequest): Promise<ApiResponse<T>> {
  await ensureRegistered();
  await delay();

  for (const route of routes) {
    const params = match(route, request.method, request.path);
    if (!params) continue;
    if (route.requiresAuth && !request.token) {
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "Sessão expirada. Faça login novamente.",
      });
    }
    const response = await route.handler({
      params,
      query: request.params,
      body: request.body,
      token: request.token,
    });
    return response as ApiResponse<T>;
  }

  throw new ApiError({
    statusCode: 404,
    code: "NOT_FOUND",
    message: `Recurso não encontrado: ${request.method} ${request.path}`,
  });
}
