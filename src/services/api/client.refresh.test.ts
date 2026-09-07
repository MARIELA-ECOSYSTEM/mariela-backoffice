import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Dublê COM ESTADO (não `vi.fn()` isolados): precisa refletir de verdade um
// `setAccessToken` subsequente a um `getAccessToken`, porque é exatamente
// isso que prova que o retry usa o token NOVO após a renovação.
let accessTokenAtual: string | null = null;
let refreshTokenAtual: string | null = null;
const getAccessTokenMock = vi.fn<() => string | null>(() => accessTokenAtual);
const setAccessTokenMock = vi.fn<(token: string) => void>((token) => {
  accessTokenAtual = token;
});
const getRefreshTokenMock = vi.fn<() => string | null>(() => refreshTokenAtual);
const setRefreshTokenMock = vi.fn<(token: string) => void>((token) => {
  refreshTokenAtual = token;
});
const clearMock = vi.fn(() => {
  accessTokenAtual = null;
  refreshTokenAtual = null;
});

vi.mock("@/services/auth/token-storage", () => ({
  tokenStorage: {
    getAccessToken: getAccessTokenMock,
    setAccessToken: setAccessTokenMock,
    getRefreshToken: getRefreshTokenMock,
    setRefreshToken: setRefreshTokenMock,
    clear: clearMock,
  },
}));

const handleUnauthorizedMock = vi.fn();
vi.mock("@/services/auth/session", () => ({
  handleUnauthorized: handleUnauthorizedMock,
}));

// Módulo real (não mockado) — usa `USE_MOCK_API=false` para exercitar o
// caminho HTTP de verdade (`httpRequest`), que é onde o mecanismo de
// renovação automática vive. Precisa ser um import DINÂMICO porque
// `API_URL`/`USE_MOCK_API` são `const`s de módulo avaliadas na importação —
// as envs precisam já estar "stubadas" antes disso acontecer.
vi.stubEnv("VITE_USE_MOCK_API", "false");
vi.stubEnv("VITE_API_URL", "http://test.local/api/v1");
const { apiClient } = await import("./client");

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiClient — renovação automática de sessão (401 → refresh → retry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessTokenAtual = "access-expirado";
    refreshTokenAtual = "refresh-valido";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uma requisição comum (200) não aciona nenhuma tentativa de refresh", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(respostaJson(200, { data: { ok: true } }));

    const resultado = await apiClient.get("/produtos");

    expect(resultado.data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("401 em uma rota autenticada: renova a sessão e repete a requisição original com o novo token", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        respostaJson(401, { statusCode: 401, code: "UNAUTHORIZED", message: "expirado" }),
      )
      .mockResolvedValueOnce(
        respostaJson(200, {
          data: {
            accessToken: "access-novo",
            refreshToken: "refresh-novo",
            expiresIn: 900,
            usuario: {},
          },
        }),
      )
      .mockResolvedValueOnce(respostaJson(200, { data: [{ id: "p1" }] }));

    const resultado = await apiClient.get("/produtos");

    expect(resultado.data).toEqual([{ id: "p1" }]);
    expect(fetch).toHaveBeenCalledTimes(3); // original (401) → refresh → original de novo (200)
    expect(setAccessTokenMock).toHaveBeenCalledWith("access-novo");
    expect(setRefreshTokenMock).toHaveBeenCalledWith("refresh-novo");

    // A 3ª chamada (retry) já deve usar o access token NOVO.
    const [, opcoesRetry] = vi.mocked(fetch).mock.calls[2]!;
    expect((opcoesRetry?.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer access-novo",
    );
  });

  it("três requisições concorrentes com 401 disparam UMA única chamada a /auth/refresh", async () => {
    // Cada rota de negócio: primeira chamada leva 401, retry (2ª chamada) responde 200.
    const chamadasPorUrl = new Map<string, number>();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return respostaJson(200, {
          data: {
            accessToken: "access-novo",
            refreshToken: "refresh-novo",
            expiresIn: 900,
            usuario: {},
          },
        });
      }
      const chamadas = (chamadasPorUrl.get(url) ?? 0) + 1;
      chamadasPorUrl.set(url, chamadas);
      return chamadas === 1
        ? respostaJson(401, { statusCode: 401, code: "UNAUTHORIZED", message: "expirado" })
        : respostaJson(200, { data: { ok: url } });
    });

    const [a, b, c] = await Promise.all([
      apiClient.get("/produtos"),
      apiClient.get("/estoque"),
      apiClient.get("/produtos/123"),
    ]);

    expect(a.data).toBeTruthy();
    expect(b.data).toBeTruthy();
    expect(c.data).toBeTruthy();

    const chamadasDeRefresh = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/auth/refresh"));
    expect(chamadasDeRefresh).toHaveLength(1);
  });

  it("quando o refresh falha (token inválido/reutilizado), encerra a sessão e NÃO tenta de novo", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        respostaJson(401, { statusCode: 401, code: "UNAUTHORIZED", message: "expirado" }),
      )
      .mockResolvedValueOnce(
        respostaJson(401, {
          statusCode: 401,
          code: "REFRESH_TOKEN_INVALID",
          message: "Sessão expirada.",
        }),
      );

    await expect(apiClient.get("/produtos")).rejects.toMatchObject({
      code: "REFRESH_TOKEN_INVALID",
    });

    expect(handleUnauthorizedMock).toHaveBeenCalledTimes(1);
    // Exatamente 2 chamadas de rede: a original + o refresh — nenhuma
    // terceira tentativa (nem de retry, nem de um segundo refresh).
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("POST /auth/login NUNCA aciona o mecanismo de refresh, mesmo recebendo 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      respostaJson(401, {
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Usuário ou senha inválidos.",
      }),
    );

    await expect(apiClient.post("/auth/login", { usuario: "x", senha: "y" })).rejects.toMatchObject(
      {
        code: "INVALID_CREDENTIALS",
      },
    );

    expect(fetch).toHaveBeenCalledTimes(1); // nenhuma tentativa de refresh
    expect(handleUnauthorizedMock).not.toHaveBeenCalled();
  });

  it("sem refresh token salvo, um 401 encerra a sessão imediatamente (sem chamar a rede de novo)", async () => {
    refreshTokenAtual = null;
    vi.mocked(fetch).mockResolvedValueOnce(
      respostaJson(401, { statusCode: 401, code: "UNAUTHORIZED", message: "expirado" }),
    );

    await expect(apiClient.get("/produtos")).rejects.toMatchObject({
      code: "REFRESH_TOKEN_INVALID",
    });

    expect(fetch).toHaveBeenCalledTimes(1); // não chamou /auth/refresh (não tinha o que enviar)
    expect(handleUnauthorizedMock).toHaveBeenCalledTimes(1);
  });
});
