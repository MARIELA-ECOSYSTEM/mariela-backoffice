import { describe, expect, it, vi, beforeEach } from "vitest";

let accessTokenAtual: string | null = null;
let refreshTokenAtual: string | null = null;
vi.mock("@/services/api/client", () => ({
  getAccessToken: () => accessTokenAtual,
  getRefreshToken: () => refreshTokenAtual,
}));

const { Route } = await import("./_backoffice");

function beforeLoad(href: string) {
  // `beforeLoad` real do TanStack Router recebe um contexto bem mais rico;
  // só a leitura de `location.href` é usada nesta rota, então é só o que o
  // dublê precisa fornecer.
  return Route.options.beforeLoad?.({ location: { href } } as never);
}

describe("/_backoffice — guard de rota", () => {
  beforeEach(() => {
    accessTokenAtual = null;
    refreshTokenAtual = null;
  });

  it("redireciona para /login quando não há access token NEM refresh token", () => {
    expect(() => beforeLoad("/produtos")).toThrow();
    try {
      beforeLoad("/produtos");
    } catch (erro) {
      expect(erro).toMatchObject({ options: { to: "/login", search: { redirect: "/produtos" } } });
    }
  });

  it("permite a navegação quando há um access token salvo", () => {
    accessTokenAtual = "access-valido";
    expect(() => beforeLoad("/produtos")).not.toThrow();
  });

  it("permite a navegação quando só há refresh token (access pode ter expirado — o apiClient renova sozinho)", () => {
    refreshTokenAtual = "refresh-valido";
    expect(() => beforeLoad("/produtos")).not.toThrow();
  });
});
