import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
const getRefreshTokenMock = vi.fn<() => string | null>();
const setAccessTokenMock = vi.fn();
const setRefreshTokenMock = vi.fn();

vi.mock("./client", () => ({
  apiClient: apiClientMock,
  getRefreshToken: getRefreshTokenMock,
  setAccessToken: setAccessTokenMock,
  setRefreshToken: setRefreshTokenMock,
}));

const { authApi } = await import("./auth.api");

const SESSAO = {
  accessToken: "access-novo",
  refreshToken: "refresh-novo",
  expiresIn: 900,
  usuario: { id: "u1", nome: "Admin", tipo: "ADMIN" as const },
};

describe("authApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("login: chama POST /auth/login e salva os dois tokens", async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: SESSAO });

    const resultado = await authApi.login({ usuario: "admin@mariela.com", senha: "123456" });

    expect(apiClientMock.post).toHaveBeenCalledWith("/auth/login", {
      usuario: "admin@mariela.com",
      senha: "123456",
    });
    expect(setAccessTokenMock).toHaveBeenCalledWith("access-novo");
    expect(setRefreshTokenMock).toHaveBeenCalledWith("refresh-novo");
    expect(resultado).toEqual(SESSAO);
  });

  it("refresh: envia o refresh token salvo e substitui os dois tokens pelo novo par", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-antigo");
    apiClientMock.post.mockResolvedValueOnce({ data: SESSAO });

    const resultado = await authApi.refresh();

    expect(apiClientMock.post).toHaveBeenCalledWith("/auth/refresh", {
      refreshToken: "refresh-antigo",
    });
    expect(setAccessTokenMock).toHaveBeenCalledWith("access-novo");
    expect(setRefreshTokenMock).toHaveBeenCalledWith("refresh-novo");
    expect(resultado).toEqual(SESSAO);
  });

  it("refresh: lança sem chamar a API quando não há refresh token salvo", async () => {
    getRefreshTokenMock.mockReturnValue(null);

    await expect(authApi.refresh()).rejects.toThrow();
    expect(apiClientMock.post).not.toHaveBeenCalled();
  });

  it("me: chama GET /auth/me e devolve o usuário", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: SESSAO.usuario });
    const usuario = await authApi.me();
    expect(apiClientMock.get).toHaveBeenCalledWith("/auth/me");
    expect(usuario).toEqual(SESSAO.usuario);
  });

  it("logout: envia o refresh token para o backend", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-atual");
    apiClientMock.post.mockResolvedValueOnce({ data: { ok: true } });

    await authApi.logout();

    expect(apiClientMock.post).toHaveBeenCalledWith("/auth/logout", {
      refreshToken: "refresh-atual",
    });
  });

  it("logout: não chama a API quando não há refresh token (nada a revogar)", async () => {
    getRefreshTokenMock.mockReturnValue(null);
    await authApi.logout();
    expect(apiClientMock.post).not.toHaveBeenCalled();
  });

  it("logout: nunca lança, mesmo se o backend falhar (best-effort)", async () => {
    getRefreshTokenMock.mockReturnValue("refresh-atual");
    apiClientMock.post.mockRejectedValueOnce(new Error("rede fora do ar"));

    await expect(authApi.logout()).resolves.toBeUndefined();
  });
});
