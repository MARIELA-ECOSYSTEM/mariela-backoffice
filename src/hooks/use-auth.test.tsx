import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouter: () => ({ state: { location: { pathname: "/produtos" } } }),
}));

const meMock = vi.fn();
const loginMock = vi.fn();
const logoutMock = vi.fn();
vi.mock("@/services/api/auth.api", () => ({
  authApi: { me: meMock, login: loginMock, logout: logoutMock },
}));

let accessTokenAtual: string | null = null;
let refreshTokenAtual: string | null = null;
vi.mock("@/services/api/client", () => ({
  getAccessToken: () => accessTokenAtual,
  getRefreshToken: () => refreshTokenAtual,
}));

const { AuthProvider, useAuth } = await import("./use-auth");

function criarWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

const USUARIO = { id: "u1", nome: "Administradora", tipo: "ADMIN" as const };

describe("useAuth — restauração de sessão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessTokenAtual = null;
    refreshTokenAtual = null;
    window.localStorage.clear();
  });

  it("sem nenhum token salvo: não chama /auth/me e conclui como não autenticado", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: criarWrapper() });

    await waitFor(() => expect(result.current.carregando).toBe(false));

    expect(meMock).not.toHaveBeenCalled();
    expect(result.current.autenticado).toBe(false);
    expect(result.current.usuario).toBeNull();
  });

  it("com access token salvo: chama /auth/me e restaura a sessão em caso de sucesso", async () => {
    accessTokenAtual = "access-valido";
    meMock.mockResolvedValueOnce(USUARIO);

    const { result } = renderHook(() => useAuth(), { wrapper: criarWrapper() });

    await waitFor(() => expect(result.current.carregando).toBe(false));

    expect(meMock).toHaveBeenCalledTimes(1);
    expect(result.current.autenticado).toBe(true);
    expect(result.current.usuario).toEqual(USUARIO);
  });

  it("com token salvo mas /auth/me falha mesmo após a renovação automática: sessão não é restaurada", async () => {
    accessTokenAtual = "access-invalido";
    refreshTokenAtual = "refresh-tambem-invalido";
    meMock.mockRejectedValueOnce(new Error("REFRESH_TOKEN_INVALID"));

    const { result } = renderHook(() => useAuth(), { wrapper: criarWrapper() });

    await waitFor(() => expect(result.current.carregando).toBe(false));

    expect(result.current.autenticado).toBe(false);
    expect(result.current.usuario).toBeNull();
  });

  it("login(): autentica o usuário devolvido pelo authApi", async () => {
    loginMock.mockResolvedValueOnce({
      accessToken: "a",
      refreshToken: "r",
      expiresIn: 900,
      usuario: USUARIO,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: criarWrapper() });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    await act(async () => {
      await result.current.login({ usuario: "admin@mariela.com", senha: "123456" });
    });

    expect(loginMock).toHaveBeenCalledWith({ usuario: "admin@mariela.com", senha: "123456" });
    expect(result.current.autenticado).toBe(true);
    expect(result.current.usuario).toEqual(USUARIO);
  });

  it("logout(): chama authApi.logout e redireciona para /login", async () => {
    logoutMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: criarWrapper() });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({ to: "/login", replace: true });
    expect(result.current.autenticado).toBe(false);
  });
});
