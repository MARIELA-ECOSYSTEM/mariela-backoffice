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
import { geracaoDaSessao, handleUnauthorized } from "@/services/auth/session";

/**
 * Endereço remoto da API REST (NestJS). Configurado exclusivamente por ambiente
 * — nunca embutir host fixo (localhost, IP da loja) no código.
 *   .env  →  VITE_API_URL=https://api.mariela.com/api/v1
 */
const API_URL_ENV = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const MOCK_ENV = (import.meta.env.VITE_USE_MOCK_API as string | undefined)?.trim();

export const API_URL = (API_URL_ENV ?? "").replace(/\/+$/, "");
/** Mock só é usado quando pedido explicitamente ou quando não há API configurada. */
export const USE_MOCK_API = MOCK_ENV === "true" || (MOCK_ENV !== "false" && API_URL === "");
export const REQUEST_TIMEOUT_MS = 15_000;
export { TOKEN_STORAGE_KEY };

/**
 * Falha cedo e de forma explícita em vez de deixar uma configuração inválida
 * aparecer depois disfarçada de erro de rede — mesmo racional do
 * `validateEnv` do backend (`mariela-backend/src/config/env.validation.ts`).
 * Roda uma única vez, na carga deste módulo (antes de qualquer requisição).
 *
 * Etapa 22 — dois cenários proibidos:
 *   1. Build de produção (`import.meta.env.PROD`) usando Mock API: um
 *      `VITE_USE_MOCK_API=true` esquecido nunca pode publicar dados fictícios
 *      em produção.
 *   2. API real selecionada (`VITE_USE_MOCK_API=false`) sem `VITE_API_URL`:
 *      sem isto, `httpRequest` monta `fetch("" + path, ...)` e todo erro
 *      vira "falha de conexão" genérica, escondendo a causa real.
 */
function validarConfiguracaoDeAmbiente(): void {
  if (import.meta.env.PROD && USE_MOCK_API) {
    throw new Error(
      "Configuração de ambiente inválida: Mock API (VITE_USE_MOCK_API=true) não pode ser utilizada em produção. Defina VITE_USE_MOCK_API=false e VITE_API_URL antes de publicar.",
    );
  }
  if (!USE_MOCK_API && API_URL === "") {
    throw new Error(
      "Configuração de ambiente inválida: VITE_USE_MOCK_API=false exige VITE_API_URL definida (nunca cai em Mock API silenciosamente).",
    );
  }
}
validarConfiguracaoDeAmbiente();

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
  return (
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/logout")
  );
}

/** Margem de segurança: renova um pouco ANTES do vencimento exato, nunca depois. */
const MARGEM_RENOVACAO_MS = 10_000;

function tokenProximoOuJaExpirado(): boolean {
  const expiraEm = obterExpiraEm();
  if (expiraEm === null) return false; // sem sessão rastreada — nada a renovar.
  return Date.now() + MARGEM_RENOVACAO_MS >= expiraEm;
}

interface TokensRenovados {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ─── Fase 22.8.4 (A1) — classificação das falhas de autenticação ──────────────────────────────────────────────────

/**
 * Códigos com que o backend REJEITA DEFINITIVAMENTE um refresh token — sempre com HTTP 401
 * (`mariela-backend/src/common/exceptions/api.exception.ts`: `refreshTokenInvalid`, `refreshTokenReused`,
 * `userInactive`). Só estes encerram a sessão automaticamente. Um 401 com qualquer outro código NÃO é tratado como
 * refresh inválido.
 */
export const CODIGOS_REJEICAO_DEFINITIVA: readonly string[] = [
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_REUSED",
  "USER_INACTIVE",
];

/** Status de gateway/proxy que indicam backend temporariamente indisponível (ex.: Render acordando). */
const STATUS_INDISPONIBILIDADE: readonly number[] = [502, 503, 504];

/**
 * - `rejeicao_definitiva` (categoria A): o servidor recusou o refresh token — a sessão acabou.
 * - `temporaria` (categoria B): rede, timeout, 502/503/504 — a sessão é preservada para nova tentativa.
 * - `desconhecida` (categoria C): qualquer outra resposta (500, 429, 401 com outro código…) — sem evidência de que a
 *   sessão expirou: também preservada, sem revogação; a requisição atual falha com a mensagem do erro.
 */
export type CategoriaFalhaAutenticacao = "rejeicao_definitiva" | "temporaria" | "desconhecida";

export function classificarFalhaDeAutenticacao(erro: unknown): CategoriaFalhaAutenticacao {
  if (!(erro instanceof ApiError)) return "desconhecida";
  if (erro.statusCode === 401 && CODIGOS_REJEICAO_DEFINITIVA.includes(erro.code)) {
    return "rejeicao_definitiva";
  }
  if (erro.code === "NETWORK_ERROR" || erro.code === "TIMEOUT") return "temporaria";
  if (erro.statusCode === 0 || erro.statusCode === 408) return "temporaria";
  if (STATUS_INDISPONIBILIDADE.includes(erro.statusCode)) return "temporaria";
  return "desconhecida";
}

/**
 * Resultado de UMA renovação:
 * - `renovada`: tokens novos gravados (a geração ainda era a vigente).
 * - `sem_refresh`: não havia refresh token local — nada a renovar.
 * - `rejeitada`: rejeição definitiva; a sessão local já foi limpa.
 * - `falhou`: falha temporária ou desconhecida; NADA foi alterado localmente — uma nova tentativa é possível.
 * - `descartada`: a sessão foi encerrada (logout/login) enquanto a renovação estava em andamento; a resposta foi
 *   ignorada sem gravar nem limpar nada. `refreshTokenEmitido` é o token que o servidor emitiu (se emitiu), para que o
 *   logout possa revogá-lo — nunca é persistido.
 */
export type ResultadoRenovacao =
  | { tipo: "renovada" }
  | { tipo: "sem_refresh" }
  | { tipo: "rejeitada"; erro: ApiError }
  | { tipo: "falhou"; categoria: "temporaria" | "desconhecida"; erro: unknown }
  | { tipo: "descartada"; refreshTokenEmitido: string | null };

/**
 * Renovação DEDUPLICADA: múltiplas chamadas concorrentes (ex.: várias queries
 * do TanStack Query disparando perto da expiração) aguardam a MESMA promessa
 * em vez de cada uma rotacionar o refresh token — o backend só aceita UMA
 * rotação por vez (índice único/CAS); uma segunda tentativa com o token já
 * rotacionado seria tratada como REUSO e derrubaria a sessão inteira.
 *
 * Fase 22.8.4 — a promessa compartilhada pertence a UMA geração da sessão: depois de um logout/login, uma requisição
 * nova não se pendura na renovação da sessão anterior (que será descartada); inicia a própria.
 */
let renovacaoEmAndamento: { geracao: number; promessa: Promise<ResultadoRenovacao> } | null = null;

function renovarSessao(): Promise<ResultadoRenovacao> {
  const geracao = geracaoDaSessao();
  if (renovacaoEmAndamento?.geracao === geracao) return renovacaoEmAndamento.promessa;
  const atual = {
    geracao,
    promessa: executarRenovacao(geracao).finally(() => {
      if (renovacaoEmAndamento === atual) renovacaoEmAndamento = null;
    }),
  };
  renovacaoEmAndamento = atual;
  return atual.promessa;
}

/** Renovação em andamento (da geração vigente ou de uma anterior), para o logout coordenar a revogação. */
export function renovacaoEmAndamentoDaSessao(): Promise<ResultadoRenovacao> | null {
  return renovacaoEmAndamento?.promessa ?? null;
}

async function executarRenovacao(geracao: number): Promise<ResultadoRenovacao> {
  const refreshToken = refreshTokenStorage.get();
  if (!refreshToken) return { tipo: "sem_refresh" };

  const requisicao: ApiRequest = {
    method: "POST",
    path: "/auth/refresh",
    params: {},
    body: { refreshToken },
    token: null,
  };
  try {
    const resposta = await executarComTransporte<TokensRenovados>(requisicao);
    // A2: resposta de uma sessão já encerrada — nunca grava (não ressuscita a sessão, não sobrescreve a de outro usuário).
    if (geracaoDaSessao() !== geracao) {
      return { tipo: "descartada", refreshTokenEmitido: resposta.data?.refreshToken ?? null };
    }
    salvarSessao(resposta.data);
    return { tipo: "renovada" };
  } catch (error) {
    // A2: falha tardia de uma sessão já encerrada — nunca limpa a sessão (possivelmente nova) vigente.
    if (geracaoDaSessao() !== geracao) return { tipo: "descartada", refreshTokenEmitido: null };
    const categoria = classificarFalhaDeAutenticacao(error);
    if (categoria === "rejeicao_definitiva") {
      // Só uma rejeição DEFINITIVA do servidor limpa a sessão local (a revogação já aconteceu lá).
      limparSessao();
      return { tipo: "rejeitada", erro: error as ApiError };
    }
    // A1: rede, timeout, 502/503/504 ou erro não classificado — tokens preservados para nova tentativa posterior.
    return { tipo: "falhou", categoria, erro: error };
  }
}

async function executarComTransporte<T>(apiRequest: ApiRequest): Promise<ApiResponse<T>> {
  return USE_MOCK_API ? await handleMockRequest<T>(apiRequest) : await httpRequest<T>(apiRequest);
}

/**
 * A sessão em que a requisição começou foi encerrada (logout/login) antes do envio: a requisição NÃO é enviada — nunca
 * com o token de outra sessão. Código local do cliente (como `TIMEOUT`/`NETWORK_ERROR`), não do backend.
 */
function erroSessaoEncerrada(): ApiError {
  return new ApiError({
    statusCode: 401,
    code: "SESSAO_ENCERRADA",
    message: "A sessão foi encerrada antes do envio da requisição. Entre novamente.",
  });
}

/** Encerra a sessão somente se ela ainda for a mesma em que a requisição começou (nunca a de um usuário posterior). */
function encerrarSeAindaVigente(geracao: number): void {
  if (geracaoDaSessao() === geracao) handleUnauthorized();
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const renovavel = !ehRotaDeAutenticacao(path);
  const geracao = geracaoDaSessao();

  // Renovação PROATIVA: evita a ida e volta extra de um 401 quando já se sabe
  // que o accessToken está vencido/perto de vencer.
  let proativa: ResultadoRenovacao | null = null;
  if (renovavel && tokenProximoOuJaExpirado()) {
    proativa = await renovarSessao();
    if (proativa.tipo === "rejeitada") {
      encerrarSeAindaVigente(geracao);
      throw proativa.erro;
    }
    if (geracaoDaSessao() !== geracao) throw erroSessaoEncerrada();
    // `falhou`/`sem_refresh`: segue com o token atual — ainda pode ser válido (margem de 10 s).
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
    if (!(error instanceof ApiError && error.statusCode === 401 && renovavel)) throw error;
    // A sessão desta requisição já foi encerrada enquanto ela estava no ar: não renova nem encerra a sessão atual.
    if (geracaoDaSessao() !== geracao) throw error;

    // Renovação REATIVA: no máximo UMA tentativa por requisição (se a proativa já ocorreu, reaproveita o resultado).
    const resultado = proativa ?? (await renovarSessao());
    switch (resultado.tipo) {
      case "descartada":
        throw error;
      case "falhou":
        // A1: indisponibilidade/erro não classificado — a sessão continua; a requisição falha com o erro real.
        throw resultado.erro;
      case "rejeitada":
        encerrarSeAindaVigente(geracao);
        throw resultado.erro;
      case "sem_refresh":
        // Access token recusado e nada com que renová-lo: a sessão local não tem como continuar.
        encerrarSeAindaVigente(geracao);
        throw error;
      case "renovada":
        if (proativa) {
          // A requisição JÁ saiu com o token recém-renovado e ainda assim recebeu 401.
          encerrarSeAindaVigente(geracao);
          throw error;
        }
        if (geracaoDaSessao() !== geracao) throw erroSessaoEncerrada();
        try {
          return await executarComTransporte<T>({ ...apiRequest, token: getToken() });
        } catch (erroRetentativa) {
          // Token recém-emitido pelo próprio servidor também recusado: encerrar evita um ciclo de rotações inúteis.
          if (erroRetentativa instanceof ApiError && erroRetentativa.statusCode === 401)
            encerrarSeAindaVigente(geracao);
          throw erroRetentativa;
        }
    }
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
