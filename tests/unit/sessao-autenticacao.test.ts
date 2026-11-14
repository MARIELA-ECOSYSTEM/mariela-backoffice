/**
 * Fase 22.8.4 — testes do ciclo de sessão: classificação das falhas de renovação (A1), recuperação na abertura (A1),
 * corrida entre renovação e logout/login (A2), deduplicação da renovação e regressão das operações pendentes.
 * Executar com: `bun test tests/unit`
 *
 * Determinísticos e sem backend: `fetch` é substituído por um falso em que CADA chamada fica pendente até o teste
 * resolvê-la explicitamente (`responder`, `falharRede`, `timeout`). A ordem das respostas é controlada pelo teste — sem
 * `setTimeout`, sem sleeps. Os tokens ficam no armazenamento em memória do próprio `token-storage.ts` (sem `window`).
 * Todos os valores são fictícios.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

// O cliente lê o ambiente na carga do módulo: API "real" (falsa) em vez do Mock, ANTES dos imports dinâmicos abaixo.
process.env.VITE_USE_MOCK_API = "false";
process.env.VITE_API_URL = "http://api.ficticia.invalid/api/v1";
const BASE_API = "http://api.ficticia.invalid/api/v1";

const { apiClient, classificarFalhaDeAutenticacao, getToken } =
  await import("@/services/api/client");
const { authApi } = await import("@/services/api/auth.api");
const { restaurarSessao } = await import("@/services/auth/restaurar-sessao");
const { encerrarSessao, geracaoDaSessao, registerSessionHandlers } =
  await import("@/services/auth/session");
const { limparSessao, obterExpiraEm, refreshTokenStorage, salvarSessao } =
  await import("@/services/auth/token-storage");
const { ApiError } = await import("@/types/api");
const { PREFIXO_ARMAZENAMENTO } = await import("@/utils/operacao-cancelamento");

// ─── fetch controlado ─────────────────────────────────────────────────────────────────────────────────────────────

interface Chamada {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | undefined;
  autorizacao: string | null;
  responder: (status: number, corpo?: unknown) => void;
  falharRede: () => void;
  timeout: () => void;
}

const chamadas: Chamada[] = [];
let pendentes = 0;

function fetchFalso(url: string | URL, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    pendentes += 1;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const concluir = () => (pendentes -= 1);
    chamadas.push({
      metodo: init?.method ?? "GET",
      caminho: String(url).slice(BASE_API.length),
      corpo: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      autorizacao: headers.authorization ?? null,
      responder: (status, corpo) => {
        concluir();
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: async () => corpo ?? null,
        } as Response);
      },
      falharRede: () => {
        concluir();
        reject(new TypeError("Failed to fetch"));
      },
      timeout: () => {
        concluir();
        reject(new DOMException("The operation was aborted.", "AbortError"));
      },
    });
  });
}

/** Avança só a fila de microtarefas (nenhum temporizador) até a `n`-ésima chamada (base 0) existir. */
async function chamada(n: number): Promise<Chamada> {
  for (let i = 0; i < 2_000 && chamadas.length <= n; i++) await Promise.resolve();
  const c = chamadas[n];
  if (!c) {
    throw new Error(
      `chamada #${n} não aconteceu; houve: ${chamadas.map((x) => x.caminho).join(", ")}`,
    );
  }
  return c;
}

/** Drena as microtarefas pendentes (sem temporizador) — usado para provar que algo NÃO aconteceu. */
async function drenar(): Promise<void> {
  for (let i = 0; i < 2_000; i++) await Promise.resolve();
}

const erro = (status: number, code: string, message = "fictício") => ({
  statusCode: status,
  code,
  message,
});
const tokens = (sufixo: string, expiresIn = 900) => ({
  accessToken: `access-${sufixo}`,
  refreshToken: `refresh-${sufixo}`,
  expiresIn,
});
const caminhos = () => chamadas.map((c) => `${c.metodo} ${c.caminho}`);
const logoutsEnviados = () =>
  chamadas.filter((c) => c.caminho === "/auth/logout").map((c) => c.corpo?.refreshToken);

function estadoDosTokens() {
  return {
    access: getToken(),
    refresh: refreshTokenStorage.get(),
    expiraEm: obterExpiraEm() !== null,
  };
}

// ─── handlers de sessão observáveis ──────────────────────────────────────────────────────────────────────────────

const eventos = { limparUsuario: 0, irParaLogin: 0, limparCache: 0 };

// ─── sessionStorage observado (operações pendentes) ─────────────────────────────────────────────────────────────

const CHAVE_PENDENCIA = `${PREFIXO_ARMAZENAMENTO}venda-ficticia-a`;
const PENDENCIA = JSON.stringify({
  versao: 2,
  vendaId: "venda-ficticia-a",
  chave: "chave-original-ficticia-0001",
  assinatura: '{"tipo":"parcial","itens":[["item-1",1]]}',
  iniciadaEm: "2026-11-14T12:00:00.000Z",
  estado: "incerta",
});
const acessosSessionStorage: string[] = [];
const dadosSessionStorage = new Map<string, string>();
const sessionStorageObservado = {
  get length() {
    return dadosSessionStorage.size;
  },
  key: (i: number) => [...dadosSessionStorage.keys()][i] ?? null,
  getItem: (k: string) => dadosSessionStorage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    acessosSessionStorage.push(`setItem ${k}`);
    dadosSessionStorage.set(k, v);
  },
  removeItem: (k: string) => {
    acessosSessionStorage.push(`removeItem ${k}`);
    dadosSessionStorage.delete(k);
  },
  clear: () => {
    acessosSessionStorage.push("clear");
    dadosSessionStorage.clear();
  },
} as Storage;

const fetchOriginal = globalThis.fetch;
const sessionStorageOriginal = (globalThis as { sessionStorage?: Storage }).sessionStorage;

beforeAll(() => {
  globalThis.fetch = fetchFalso as typeof fetch;
  (globalThis as { sessionStorage?: Storage }).sessionStorage = sessionStorageObservado;
  registerSessionHandlers({
    limparUsuario: () => void (eventos.limparUsuario += 1),
    limparCache: () => void (eventos.limparCache += 1),
    irParaLogin: () => void (eventos.irParaLogin += 1),
    rotaAtual: () => "/vendas/venda-ficticia-a",
  });
});

afterAll(() => {
  globalThis.fetch = fetchOriginal;
  (globalThis as { sessionStorage?: Storage }).sessionStorage = sessionStorageOriginal;
  registerSessionHandlers(null);
});

beforeEach(() => {
  limparSessao();
  chamadas.length = 0;
  pendentes = 0;
  eventos.limparUsuario = eventos.irParaLogin = eventos.limparCache = 0;
  dadosSessionStorage.clear();
  dadosSessionStorage.set(CHAVE_PENDENCIA, PENDENCIA);
  acessosSessionStorage.length = 0;
});

afterEach(() => {
  // Nenhuma requisição pode ficar pendurada (cada teste resolve explicitamente tudo o que provocou).
  expect(pendentes).toBe(0);
  // 8.4 — nenhuma lógica de sessão toca nas operações pendentes nem envia cancelamento/devolução.
  expect(acessosSessionStorage).toEqual([]);
  expect(dadosSessionStorage.get(CHAVE_PENDENCIA)).toBe(PENDENCIA);
  expect(chamadas.some((c) => c.caminho.includes("/cancelamento"))).toBe(false);
});

/**
 * Marca a promessa como tratada (o teste examina o resultado DEPOIS de resolver outras chamadas, e uma rejeição sem
 * tratador naquele intervalo seria reportada como não tratada). Devolve a MESMA promessa.
 */
function acompanhar<T>(promessa: Promise<T>): Promise<T> {
  promessa.catch(() => {});
  return promessa;
}

/** GET autenticado cujo access token é recusado (401 do guard), disparando a renovação reativa. */
function getCom401(indiceGet = 0) {
  const promessa = acompanhar(apiClient.get("/vendas"));
  void chamada(indiceGet).then((c) =>
    c.responder(401, erro(401, "UNAUTHORIZED", "Sessão expirada.")),
  );
  return promessa;
}

// ─── 8.1 — A1: classificação das falhas de renovação ─────────────────────────────────────────────────────────────

describe("8.1 renovação (A1)", () => {
  test("1. sucesso: grava o par novo e refaz a requisição com o token novo", async () => {
    salvarSessao(tokens("1"));
    const req = getCom401();
    const refresh = await chamada(1);
    expect(refresh.caminho).toBe("/auth/refresh");
    expect(refresh.corpo).toEqual({ refreshToken: "refresh-1" });
    refresh.responder(200, { data: tokens("2") });
    const retentativa = await chamada(2);
    expect(retentativa.autorizacao).toBe("Bearer access-2");
    retentativa.responder(200, { data: ["ok"] });
    expect((await req).data).toEqual(["ok"]);
    expect(estadoDosTokens()).toEqual({ access: "access-2", refresh: "refresh-2", expiraEm: true });
    expect(eventos.limparUsuario).toBe(0);
    expect(logoutsEnviados()).toEqual([]);
  });

  const temporarias: [string, (c: Chamada) => void, string][] = [
    ["2. falha de rede", (c) => c.falharRede(), "NETWORK_ERROR"],
    ["3. timeout", (c) => c.timeout(), "TIMEOUT"],
    ["4. HTTP 502", (c) => c.responder(502), "HTTP_ERROR"],
    ["5. HTTP 503", (c) => c.responder(503), "HTTP_ERROR"],
    ["6. HTTP 504", (c) => c.responder(504), "HTTP_ERROR"],
  ];
  for (const [nome, falhar, codigo] of temporarias) {
    test(`${nome}: tokens preservados, sem logout nem revogação, nova tentativa possível`, async () => {
      salvarSessao(tokens("1"));
      const antes = estadoDosTokens();
      const req = getCom401();
      falhar(await chamada(1));
      const erroFinal = await req.catch((e: unknown) => e);
      expect(erroFinal).toBeInstanceOf(ApiError);
      expect((erroFinal as InstanceType<typeof ApiError>).code).toBe(codigo);
      expect(estadoDosTokens()).toEqual(antes);
      expect(eventos.limparUsuario).toBe(0);
      expect(eventos.irParaLogin).toBe(0);
      expect(logoutsEnviados()).toEqual([]);
      expect(caminhos()).toEqual(["GET /vendas", "POST /auth/refresh"]);

      // Nova tentativa depois da falha temporária: a promessa compartilhada foi liberada e o MESMO refresh é reenviado.
      const req2 = getCom401(2);
      const refresh2 = await chamada(3);
      expect(refresh2.corpo).toEqual({ refreshToken: "refresh-1" });
      refresh2.responder(200, { data: tokens("2") });
      (await chamada(4)).responder(200, { data: [] });
      await req2;
      expect(estadoDosTokens().access).toBe("access-2");
    });
  }

  for (const [n, codigo] of [
    [7, "REFRESH_TOKEN_INVALID"],
    [8, "REFRESH_TOKEN_REUSED"],
    [9, "USER_INACTIVE"],
  ] as const) {
    test(`${n}. 401 ${codigo}: rejeição definitiva — sessão encerrada uma vez, sem revogação extra`, async () => {
      salvarSessao(tokens("1"));
      const geracao = geracaoDaSessao();
      const req = getCom401();
      (await chamada(1)).responder(401, erro(401, codigo, `rejeitado (${codigo})`));
      const erroFinal = (await req.catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
      expect(erroFinal.code).toBe(codigo);
      expect(estadoDosTokens()).toEqual({ access: null, refresh: null, expiraEm: false });
      expect(eventos.limparUsuario).toBe(1);
      expect(eventos.irParaLogin).toBe(1);
      expect(geracaoDaSessao()).toBeGreaterThan(geracao);
      // O servidor já revogou; o cliente não envia /auth/logout nem tenta renovar de novo.
      expect(caminhos()).toEqual(["GET /vendas", "POST /auth/refresh"]);
    });
  }

  const desconhecidos: [string, (c: Chamada) => void][] = [
    ["HTTP 500", (c) => c.responder(500, erro(500, "INTERNAL_ERROR"))],
    ["HTTP 429", (c) => c.responder(429, erro(429, "TOO_MANY_REQUESTS"))],
    ["401 com código não reconhecido", (c) => c.responder(401, erro(401, "UNAUTHORIZED"))],
    ["400 de validação", (c) => c.responder(400, erro(400, "VALIDATION_ERROR"))],
  ];
  for (const [nome, falhar] of desconhecidos) {
    test(`10. erro desconhecido (${nome}): não presume expiração — tokens preservados, sem logout`, async () => {
      salvarSessao(tokens("1"));
      const antes = estadoDosTokens();
      const req = getCom401();
      falhar(await chamada(1));
      await expect(req).rejects.toBeInstanceOf(ApiError);
      expect(estadoDosTokens()).toEqual(antes);
      expect(eventos.limparUsuario).toBe(0);
      expect(logoutsEnviados()).toEqual([]);
      // Sem laço: uma única renovação por requisição.
      await drenar();
      expect(caminhos()).toEqual(["GET /vendas", "POST /auth/refresh"]);
    });
  }

  test("classificação: só os três códigos reais com HTTP 401 são rejeição definitiva", () => {
    const c = (status: number, code: string) =>
      classificarFalhaDeAutenticacao(new ApiError({ statusCode: status, code, message: "x" }));
    expect(c(401, "REFRESH_TOKEN_INVALID")).toBe("rejeicao_definitiva");
    expect(c(401, "REFRESH_TOKEN_REUSED")).toBe("rejeicao_definitiva");
    expect(c(401, "USER_INACTIVE")).toBe("rejeicao_definitiva");
    expect(c(403, "REFRESH_TOKEN_INVALID")).toBe("desconhecida");
    expect(c(401, "UNAUTHORIZED")).toBe("desconhecida");
    expect(c(0, "NETWORK_ERROR")).toBe("temporaria");
    expect(c(408, "TIMEOUT")).toBe("temporaria");
    for (const s of [502, 503, 504]) expect(c(s, "HTTP_ERROR")).toBe("temporaria");
    expect(c(500, "INTERNAL_ERROR")).toBe("desconhecida");
    expect(classificarFalhaDeAutenticacao(new Error("x"))).toBe("desconhecida");
  });

  test("renovação PROATIVA com falha temporária: a requisição segue com o token atual e não renova duas vezes", async () => {
    salvarSessao(tokens("1", 0)); // já vencido → renovação proativa
    const req = acompanhar(apiClient.get("/vendas"));
    const refresh = await chamada(0);
    expect(refresh.caminho).toBe("/auth/refresh");
    refresh.responder(503);
    const get = await chamada(1);
    expect(get.autorizacao).toBe("Bearer access-1");
    get.responder(401, erro(401, "UNAUTHORIZED"));
    const erroFinal = (await req.catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(erroFinal.statusCode).toBe(503);
    expect(caminhos()).toEqual(["POST /auth/refresh", "GET /vendas"]);
    expect(estadoDosTokens().refresh).toBe("refresh-1");
    expect(eventos.limparUsuario).toBe(0);
  });

  test("renovação PROATIVA rejeitada: encerra sem enviar a requisição", async () => {
    salvarSessao(tokens("1", 0));
    const req = acompanhar(apiClient.get("/vendas"));
    (await chamada(0)).responder(401, erro(401, "REFRESH_TOKEN_INVALID"));
    await expect(req).rejects.toBeInstanceOf(ApiError);
    await drenar();
    expect(caminhos()).toEqual(["POST /auth/refresh"]);
    expect(eventos.limparUsuario).toBe(1);
    expect(estadoDosTokens().refresh).toBeNull();
  });

  test("access recusado sem refresh token local: encerra (nada com que renovar)", async () => {
    salvarSessao(tokens("1"));
    refreshTokenStorage.clear();
    const req = getCom401();
    await expect(req).rejects.toBeInstanceOf(ApiError);
    expect(caminhos()).toEqual(["GET /vendas"]);
    expect(eventos.limparUsuario).toBe(1);
  });

  test("token recém-renovado também recusado: encerra (evita ciclo de rotações)", async () => {
    salvarSessao(tokens("1"));
    const req = getCom401();
    (await chamada(1)).responder(200, { data: tokens("2") });
    (await chamada(2)).responder(401, erro(401, "UNAUTHORIZED"));
    await expect(req).rejects.toBeInstanceOf(ApiError);
    expect(eventos.limparUsuario).toBe(1);
    await drenar();
    expect(caminhos()).toEqual(["GET /vendas", "POST /auth/refresh", "GET /vendas"]);
  });
});

// ─── 8.2 — A1: recuperação na abertura ───────────────────────────────────────────────────────────────────────────

describe("8.2 abertura do aplicativo (A1)", () => {
  const USUARIO = {
    id: "usr-ficticio",
    codigo: "USR-9999",
    nome: "Admin Fictício",
    email: "admin@ficticio.test",
    tipo: "ADMIN",
    ativo: true,
  };

  test("sem sessão local: nada é chamado", async () => {
    expect(await restaurarSessao()).toEqual({ tipo: "sem_sessao" });
    expect(chamadas).toEqual([]);
  });

  test("1. /auth/me 200: sessão restaurada", async () => {
    salvarSessao(tokens("1"));
    const r = restaurarSessao();
    (await chamada(0)).responder(200, { data: USUARIO });
    expect(await r).toEqual({ tipo: "autenticada", usuario: USUARIO as never });
  });

  const indisponiveis: [string, (c: Chamada) => void][] = [
    ["2. timeout", (c) => c.timeout()],
    ["3. falha de rede", (c) => c.falharRede()],
    ["4. HTTP 502", (c) => c.responder(502)],
    ["5. HTTP 503", (c) => c.responder(503)],
    ["6. HTTP 504", (c) => c.responder(504)],
  ];
  for (const [nome, falhar] of indisponiveis) {
    test(`${nome}: sessão NÃO validada mas preservada — sem logout, sem revogação`, async () => {
      salvarSessao(tokens("1"));
      const antes = estadoDosTokens();
      const r = restaurarSessao();
      falhar(await chamada(0));
      const resultado = await r;
      expect(resultado.tipo).toBe("nao_validada");
      expect(resultado.tipo === "nao_validada" && resultado.motivo).toBe("indisponivel");
      expect(estadoDosTokens()).toEqual(antes);
      expect(eventos.limparUsuario).toBe(0);
      expect(logoutsEnviados()).toEqual([]);
      expect(caminhos()).toEqual(["GET /auth/me"]);
    });
  }

  test("access vencido no /auth/me + renovação indisponível (Render acordando): sessão preservada", async () => {
    salvarSessao(tokens("1"));
    const r = restaurarSessao();
    (await chamada(0)).responder(401, erro(401, "UNAUTHORIZED"));
    (await chamada(1)).timeout();
    const resultado = await r;
    expect(resultado.tipo === "nao_validada" && resultado.motivo).toBe("indisponivel");
    expect(estadoDosTokens().refresh).toBe("refresh-1");
    expect(logoutsEnviados()).toEqual([]);
  });

  test("7. rejeição definitiva (401 → refresh REFRESH_TOKEN_REUSED): sessão encerrada", async () => {
    salvarSessao(tokens("1"));
    const r = restaurarSessao();
    (await chamada(0)).responder(401, erro(401, "UNAUTHORIZED"));
    (await chamada(1)).responder(401, erro(401, "REFRESH_TOKEN_REUSED"));
    expect(await r).toEqual({ tipo: "encerrada" });
    expect(estadoDosTokens()).toEqual({ access: null, refresh: null, expiraEm: false });
    expect(eventos.irParaLogin).toBe(1);
    expect(logoutsEnviados()).toEqual([]);
  });

  for (const [nome, status, code] of [
    ["HTTP 500", 500, "INTERNAL_ERROR"],
    ["HTTP 404 (usuário não encontrado)", 404, "NOT_FOUND"],
  ] as const) {
    test(`8. erro desconhecido (${nome}): não revoga — sessão não validada, motivo desconhecido`, async () => {
      salvarSessao(tokens("1"));
      const r = restaurarSessao();
      (await chamada(0)).responder(status, erro(status, code));
      const resultado = await r;
      expect(resultado.tipo === "nao_validada" && resultado.motivo).toBe("desconhecido");
      expect(estadoDosTokens().refresh).toBe("refresh-1");
      expect(eventos.limparUsuario).toBe(0);
      expect(logoutsEnviados()).toEqual([]);
    });
  }

  test("logout durante a validação: o resultado tardio não restaura a sessão", async () => {
    salvarSessao(tokens("1"));
    const r = restaurarSessao();
    const me = await chamada(0);
    const logout = authApi.logout();
    me.responder(200, { data: USUARIO });
    expect(await r).toEqual({ tipo: "encerrada" });
    (await chamada(1)).responder(200, { data: null });
    await logout;
    expect(estadoDosTokens().access).toBeNull();
  });
});

// ─── 8.3 — A2: corrida entre renovação e logout/login ────────────────────────────────────────────────────────────

describe("8.3 renovação × logout (A2)", () => {
  test("1. logout sem renovação: limpeza local imediata (síncrona) e revogação do refresh", async () => {
    salvarSessao(tokens("A1"));
    const geracao = geracaoDaSessao();
    const logout = authApi.logout();
    // Ainda sem nenhum await: a sessão local JÁ acabou.
    expect(estadoDosTokens()).toEqual({ access: null, refresh: null, expiraEm: false });
    expect(geracaoDaSessao()).toBeGreaterThan(geracao);
    const revogacao = await chamada(0);
    expect(revogacao.caminho).toBe("/auth/logout");
    expect(revogacao.corpo).toEqual({ refreshToken: "refresh-A1" });
    revogacao.responder(200, { data: null });
    await logout;
  });

  test("2/3/6. logout DURANTE a renovação; sucesso tardio é descartado e o token emitido é revogado", async () => {
    salvarSessao(tokens("A1"));
    const req = getCom401();
    const refresh = await chamada(1);
    const logout = authApi.logout();
    expect(estadoDosTokens().access).toBeNull();
    // A revogação ESPERA a renovação em andamento (evita o falso "reuso" que revogaria todas as sessões do usuário).
    await drenar();
    expect(chamadas.length).toBe(2);

    refresh.responder(200, { data: tokens("A2") });
    // Ordem determinística: primeiro o refresh local antigo, depois o emitido tardiamente.
    (await chamada(2)).responder(200, { data: null });
    (await chamada(3)).responder(200, { data: null });
    await logout;
    expect(logoutsEnviados()).toEqual(["refresh-A1", "refresh-A2"]);
    expect(estadoDosTokens()).toEqual({ access: null, refresh: null, expiraEm: false });
    // A requisição original falha sem refazer nada e sem "encerrar" de novo.
    await expect(req).rejects.toBeInstanceOf(ApiError);
    expect(eventos.limparUsuario).toBe(0);
    expect(caminhos().filter((c) => c === "GET /vendas")).toHaveLength(1);
  });

  test("4/5. logout → login de B → sucesso tardio da renovação de A não sobrescreve a sessão de B", async () => {
    salvarSessao(tokens("A1"));
    const req = getCom401();
    const refreshA = await chamada(1);
    const logout = authApi.logout();
    const login = authApi.login({ usuario: "b@ficticio.test", senha: "ficticia" });
    const postLogin = await chamada(2);
    expect(postLogin.caminho).toBe("/auth/login");
    postLogin.responder(200, { data: { ...tokens("B1"), usuario: { id: "usr-b" } } });
    await login;
    expect(estadoDosTokens().access).toBe("access-B1");

    refreshA.responder(200, { data: tokens("A2") });
    (await chamada(3)).responder(200, { data: null });
    (await chamada(4)).responder(200, { data: null });
    await logout;
    await expect(req).rejects.toBeInstanceOf(ApiError);
    expect(estadoDosTokens()).toEqual({
      access: "access-B1",
      refresh: "refresh-B1",
      expiraEm: true,
    });
    expect(logoutsEnviados()).toEqual(["refresh-A1", "refresh-A2"]);
    expect(eventos.limparUsuario).toBe(0);
  });

  for (const [nome, falhar] of [
    [
      "401 REFRESH_TOKEN_REUSED",
      (c: Chamada) => c.responder(401, erro(401, "REFRESH_TOKEN_REUSED")),
    ],
    ["falha de rede", (c: Chamada) => c.falharRede()],
  ] as const) {
    test(`7. erro tardio (${nome}) da renovação de A não limpa nem encerra a sessão de B`, async () => {
      salvarSessao(tokens("A1"));
      const req = getCom401();
      const refreshA = await chamada(1);
      const logout = authApi.logout();
      const login = authApi.login({ usuario: "b@ficticio.test", senha: "ficticia" });
      (await chamada(2)).responder(200, { data: { ...tokens("B1"), usuario: { id: "usr-b" } } });
      await login;

      falhar(refreshA);
      (await chamada(3)).responder(200, { data: null });
      await logout;
      await expect(req).rejects.toBeInstanceOf(ApiError);
      expect(estadoDosTokens()).toEqual({
        access: "access-B1",
        refresh: "refresh-B1",
        expiraEm: true,
      });
      expect(eventos.limparUsuario).toBe(0);
      expect(eventos.irParaLogin).toBe(0);
      expect(logoutsEnviados()).toEqual(["refresh-A1"]);
    });
  }

  test("8. logout com backend indisponível: não lança e a sessão local fica encerrada", async () => {
    salvarSessao(tokens("A1"));
    const logout = authApi.logout();
    (await chamada(0)).falharRede();
    await logout;
    expect(estadoDosTokens()).toEqual({ access: null, refresh: null, expiraEm: false });
  });

  test("8b. logout durante a renovação com backend indisponível: renovação e revogação falham, sessão local encerrada", async () => {
    salvarSessao(tokens("A1"));
    const req = getCom401();
    const refresh = await chamada(1);
    const logout = authApi.logout();
    refresh.timeout();
    (await chamada(2)).falharRede();
    await logout;
    await expect(req).rejects.toBeInstanceOf(ApiError);
    expect(estadoDosTokens()).toEqual({ access: null, refresh: null, expiraEm: false });
  });

  test("requisição de A com 401 tardio depois do login de B: não renova nem encerra a sessão de B", async () => {
    salvarSessao(tokens("A1"));
    const reqA = acompanhar(apiClient.get("/vendas"));
    const getA = await chamada(0);
    const logout = authApi.logout();
    (await chamada(1)).responder(200, { data: null });
    await logout;
    const login = authApi.login({ usuario: "b@ficticio.test", senha: "ficticia" });
    (await chamada(2)).responder(200, { data: { ...tokens("B1"), usuario: { id: "usr-b" } } });
    await login;

    getA.responder(401, erro(401, "UNAUTHORIZED"));
    await expect(reqA).rejects.toBeInstanceOf(ApiError);
    await drenar();
    expect(caminhos()).toEqual(["GET /vendas", "POST /auth/logout", "POST /auth/login"]);
    expect(estadoDosTokens().access).toBe("access-B1");
    expect(eventos.limparUsuario).toBe(0);
  });

  test("requisição aguardando renovação PROATIVA durante logout+login: não é enviada com o token de B", async () => {
    salvarSessao(tokens("A1", 0));
    const reqA = acompanhar(apiClient.post("/vendas/venda-ficticia-a/observacao", { texto: "x" }));
    const refreshA = await chamada(0);
    const logout = authApi.logout();
    const login = authApi.login({ usuario: "b@ficticio.test", senha: "ficticia" });
    (await chamada(1)).responder(200, { data: { ...tokens("B1"), usuario: { id: "usr-b" } } });
    await login;
    refreshA.responder(200, { data: tokens("A2") });
    (await chamada(2)).responder(200, { data: null });
    (await chamada(3)).responder(200, { data: null });
    await logout;
    const erroFinal = (await reqA.catch((e: unknown) => e)) as InstanceType<typeof ApiError>;
    expect(erroFinal.code).toBe("SESSAO_ENCERRADA");
    await drenar();
    expect(chamadas.some((c) => c.caminho.startsWith("/vendas"))).toBe(false);
    expect(estadoDosTokens().access).toBe("access-B1");
  });

  test("requisição de B não se pendura na renovação descartada de A: inicia a própria", async () => {
    salvarSessao(tokens("A1"));
    const reqA = getCom401();
    const refreshA = await chamada(1);
    const logout = authApi.logout();
    const login = authApi.login({ usuario: "b@ficticio.test", senha: "ficticia" });
    (await chamada(2)).responder(200, { data: { ...tokens("B1"), usuario: { id: "usr-b" } } });
    await login;

    const reqB = acompanhar(apiClient.get("/vendas"));
    (await chamada(3)).responder(401, erro(401, "UNAUTHORIZED"));
    const refreshB = await chamada(4);
    expect(refreshB.corpo).toEqual({ refreshToken: "refresh-B1" });
    refreshB.responder(200, { data: tokens("B2") });
    const retentativaB = await chamada(5);
    expect(retentativaB.autorizacao).toBe("Bearer access-B2");
    retentativaB.responder(200, { data: [] });
    await reqB;

    refreshA.responder(200, { data: tokens("A2") });
    (await chamada(6)).responder(200, { data: null });
    (await chamada(7)).responder(200, { data: null });
    await logout;
    await expect(reqA).rejects.toBeInstanceOf(ApiError);
    expect(estadoDosTokens()).toEqual({
      access: "access-B2",
      refresh: "refresh-B2",
      expiraEm: true,
    });
  });

  test("encerramento por rejeição também invalida a geração (resposta antiga não grava depois)", async () => {
    salvarSessao(tokens("A1"));
    const geracao = geracaoDaSessao();
    await encerrarSessao({ redirecionar: false });
    expect(geracaoDaSessao()).toBeGreaterThan(geracao);
    expect(eventos.irParaLogin).toBe(0);
    expect(estadoDosTokens().access).toBeNull();
  });
});

// ─── 7 / 8.3.9 — concorrência ────────────────────────────────────────────────────────────────────────────────────

describe("concorrência da renovação", () => {
  test("9. duas requisições com 401 simultâneo: UMA rotação, resposta compartilhada, ambas refeitas", async () => {
    salvarSessao(tokens("1"));
    const r1 = acompanhar(apiClient.get("/vendas"));
    const r2 = acompanhar(apiClient.get("/produtos"));
    const g1 = await chamada(0);
    const g2 = await chamada(1);
    g1.responder(401, erro(401, "UNAUTHORIZED"));
    g2.responder(401, erro(401, "UNAUTHORIZED"));
    const refresh = await chamada(2);
    await drenar();
    expect(chamadas.filter((c) => c.caminho === "/auth/refresh")).toHaveLength(1);
    refresh.responder(200, { data: tokens("2") });
    const ret1 = await chamada(3);
    const ret2 = await chamada(4);
    expect([ret1.autorizacao, ret2.autorizacao]).toEqual(["Bearer access-2", "Bearer access-2"]);
    ret1.responder(200, { data: 1 });
    ret2.responder(200, { data: 2 });
    expect([(await r1).data, (await r2).data].sort()).toEqual([1, 2]);
  });

  test("duas requisições com token vencido: UMA renovação proativa", async () => {
    salvarSessao(tokens("1", 0));
    const r1 = acompanhar(apiClient.get("/vendas"));
    const r2 = acompanhar(apiClient.get("/produtos"));
    const refresh = await chamada(0);
    await drenar();
    expect(caminhos()).toEqual(["POST /auth/refresh"]);
    refresh.responder(200, { data: tokens("2") });
    (await chamada(1)).responder(200, { data: 1 });
    (await chamada(2)).responder(200, { data: 2 });
    await Promise.all([r1, r2]);
    expect(chamadas.slice(1).map((c) => c.autorizacao)).toEqual([
      "Bearer access-2",
      "Bearer access-2",
    ]);
  });

  test("falha temporária compartilhada: ambas falham, nenhuma encerra, e a promessa é liberada", async () => {
    salvarSessao(tokens("1"));
    const r1 = acompanhar(apiClient.get("/vendas"));
    const r2 = acompanhar(apiClient.get("/produtos"));
    (await chamada(0)).responder(401, erro(401, "UNAUTHORIZED"));
    (await chamada(1)).responder(401, erro(401, "UNAUTHORIZED"));
    (await chamada(2)).responder(503);
    await expect(r1).rejects.toBeInstanceOf(ApiError);
    await expect(r2).rejects.toBeInstanceOf(ApiError);
    expect(chamadas.filter((c) => c.caminho === "/auth/refresh")).toHaveLength(1);
    expect(eventos.limparUsuario).toBe(0);
    const r3 = getCom401(3);
    (await chamada(4)).responder(200, { data: tokens("2") });
    (await chamada(5)).responder(200, { data: [] });
    await r3;
  });

  test("rejeição definitiva compartilhada: a sessão é encerrada uma única vez", async () => {
    salvarSessao(tokens("1"));
    const r1 = acompanhar(apiClient.get("/vendas"));
    const r2 = acompanhar(apiClient.get("/produtos"));
    (await chamada(0)).responder(401, erro(401, "UNAUTHORIZED"));
    (await chamada(1)).responder(401, erro(401, "UNAUTHORIZED"));
    (await chamada(2)).responder(401, erro(401, "REFRESH_TOKEN_INVALID"));
    await expect(r1).rejects.toBeInstanceOf(ApiError);
    await expect(r2).rejects.toBeInstanceOf(ApiError);
    await drenar();
    expect(eventos.limparUsuario).toBe(1);
    expect(eventos.irParaLogin).toBe(1);
  });
});
