import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryTokenStorage, setTokenStorage } from "./token-storage";
import { encerrarSessao, handleUnauthorized, registerSessionHandlers } from "./session";

describe("encerrarSessao / handleUnauthorized", () => {
  const storage = createMemoryTokenStorage();

  beforeEach(() => {
    setTokenStorage(storage);
    storage.setAccessToken("access-1");
    storage.setRefreshToken("refresh-1");
  });

  afterEach(() => {
    registerSessionHandlers(null);
  });

  it("limpa os tokens, o usuário do contexto e o cache, e redireciona por padrão", async () => {
    const limparUsuario = vi.fn();
    const limparCache = vi.fn();
    const irParaLogin = vi.fn();
    registerSessionHandlers({
      limparUsuario,
      limparCache,
      irParaLogin,
      rotaAtual: () => "/produtos",
    });

    await encerrarSessao({ redirecionar: true });

    expect(storage.getAccessToken()).toBeNull();
    expect(storage.getRefreshToken()).toBeNull();
    expect(limparUsuario).toHaveBeenCalledTimes(1);
    expect(limparCache).toHaveBeenCalledTimes(1);
    expect(irParaLogin).toHaveBeenCalledTimes(1);
  });

  it("não redireciona de novo quando já está no /login (evita loop)", async () => {
    const irParaLogin = vi.fn();
    registerSessionHandlers({
      limparUsuario: vi.fn(),
      limparCache: vi.fn(),
      irParaLogin,
      rotaAtual: () => "/login",
    });

    await encerrarSessao({ redirecionar: true });

    expect(irParaLogin).not.toHaveBeenCalled();
  });

  it("respeita redirecionar: false (usado na restauração silenciosa de sessão)", async () => {
    const irParaLogin = vi.fn();
    registerSessionHandlers({
      limparUsuario: vi.fn(),
      limparCache: vi.fn(),
      irParaLogin,
      rotaAtual: () => "/produtos",
    });

    await encerrarSessao({ redirecionar: false });

    expect(irParaLogin).not.toHaveBeenCalled();
    expect(storage.getAccessToken()).toBeNull();
  });

  it("handleUnauthorized() aciona o mesmo encerramento com redirecionamento", () => {
    const irParaLogin = vi.fn();
    registerSessionHandlers({
      limparUsuario: vi.fn(),
      limparCache: vi.fn(),
      irParaLogin,
      rotaAtual: () => "/produtos",
    });

    handleUnauthorized();

    // `handleUnauthorized` é fire-and-forget (não retorna a promise) — o
    // encerramento em si é síncrono o bastante para já ter limpado o storage.
    expect(storage.getAccessToken()).toBeNull();
  });

  it("funciona mesmo sem nenhum handler registrado (app ainda não montou o AuthProvider)", async () => {
    registerSessionHandlers(null);
    await expect(encerrarSessao({ redirecionar: true })).resolves.toBeUndefined();
    expect(storage.getAccessToken()).toBeNull();
  });
});
