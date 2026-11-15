/**
 * Fase 22.8.8.4 (M4) — testes do serviço central da sessão desktop (`src/services/auth/sessao-nativa.ts`) e da sua
 * integração com login, refresh e logout. Executar com: `bun test tests/unit`
 *
 * Sem Credential Manager real e sem Tauri: o cofre é o CLIENTE REAL da M3 (`criarCofreSessao`) sobre um processo
 * nativo FALSO que reproduz as regras dos comandos Rust (validação, seq) e permite injetar falhas. O armazenamento
 * legado é o real (`token-storage.ts`, em memória neste ambiente). O backend é um `fetch` falso cujas respostas o teste
 * controla — sem temporizadores. Todos os valores são sintéticos.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

process.env.VITE_USE_MOCK_API = "false";
process.env.VITE_API_URL = "http://api.ficticia.invalid/api/v1";
const BASE_API = "http://api.ficticia.invalid/api/v1";

const { apiClient } = await import("@/services/api/client");
const { authApi } = await import("@/services/api/auth.api");
const { registerSessionHandlers, encerrarSessao } = await import("@/services/auth/session");
const tokenStorageMod = await import("@/services/auth/token-storage");
const { lerRenovacaoPendente } = await import("@/services/auth/refresh-idempotencia");
const { criarCofreSessao, sessaoV1Valida } = await import("@/services/auth/cofre-sessao");
const nativa = await import("@/services/auth/sessao-nativa");
type SessaoV1 = import("@/services/auth/cofre-sessao").SessaoV1;
type TransporteCofre = import("@/services/auth/cofre-sessao").TransporteCofre;

const {
  limparSessao,
  refreshTokenStorage,
  tokenStorage,
  obterExpiraEm,
  marcadorSessaoNativaStorageAtual,
  renovacaoPendenteStorageAtual,
} = tokenStorageMod;

// ─── SHA-256 servido em microtarefa (mesma justificativa e prova de equivalência de `sessao-autenticacao.test.ts`) ─

const digestReal = crypto.subtle.digest.bind(crypto.subtle);
function digestEmMicrotarefa(
  algoritmo: AlgorithmIdentifier,
  dados: BufferSource,
): Promise<ArrayBuffer> {
  if (algoritmo !== "SHA-256") return digestReal(algoritmo, dados);
  const view = ArrayBuffer.isView(dados)
    ? new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
    : new Uint8Array(dados);
  const bytes = createHash("sha256").update(view).digest();
  return Promise.resolve(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer,
  );
}
const sha256 = (texto: string) => createHash("sha256").update(texto).digest("hex");

// ─── Processo nativo falso (regras da M2 + injeção de falhas) ─────────────────────────────────────────────────────

class NativoFalso implements TransporteCofre {
  ultimoSeq = 0;
  conteudo: string | null = null;
  comandos: string[] = [];
  gravacoes = 0;
  /** Próxima gravação: o seq é consumido e o "Windows" falha. */
  falharGravacao = 0;
  /** Próximas leituras com erro do cofre. */
  falharLeitura = 0;
  /** Próximas invocações rejeitadas antes de chegar ao "Rust" (IPC). */
  falharIpc = 0;
  /** Próxima exclusão falha no "Windows". */
  falharExclusao = 0;
  /** Próxima leitura devolve este conteúdo (simula divergência). */
  leituraDivergente: string | null = null;

  disponivel(): boolean {
    return true;
  }

  async invocar(comando: string, argumentos?: Record<string, unknown>): Promise<unknown> {
    this.comandos.push(comando);
    if (this.falharIpc > 0) {
      this.falharIpc -= 1;
      throw "IPC indisponível (simulado)";
    }
    if (comando === "sessao_carregar") {
      if (this.falharLeitura > 0) {
        this.falharLeitura -= 1;
        throw "COFRE_INDISPONIVEL";
      }
      if (this.leituraDivergente !== null) {
        const c = this.leituraDivergente;
        this.leituraDivergente = null;
        return { conteudo: c, seq: this.ultimoSeq };
      }
      return { conteudo: this.conteudo, seq: this.ultimoSeq };
    }
    const seq = argumentos?.["seq"] as number;
    if (
      comando === "sessao_gravar" &&
      !sessaoV1Valida(JSON.parse(argumentos?.["conteudo"] as string))
    ) {
      throw "FORMATO_INVALIDO";
    }
    if (seq <= this.ultimoSeq) throw "GRAVACAO_OBSOLETA";
    this.ultimoSeq = seq;
    if (comando === "sessao_gravar") {
      if (this.falharGravacao > 0) {
        this.falharGravacao -= 1;
        throw "COFRE_INDISPONIVEL";
      }
      this.gravacoes += 1;
      this.conteudo = argumentos?.["conteudo"] as string;
    } else {
      if (this.falharExclusao > 0) {
        this.falharExclusao -= 1;
        throw "COFRE_INDISPONIVEL";
      }
      this.conteudo = null;
    }
    return null;
  }

  sessao(): SessaoV1 | null {
    return this.conteudo ? (JSON.parse(this.conteudo) as SessaoV1) : null;
  }
}

// ─── Backend falso ───────────────────────────────────────────────────────────────────────────────────────────────

interface Chamada {
  caminho: string;
  corpo: Record<string, unknown> | undefined;
  idempotencia: string | null;
  responder: (status: number, corpo?: unknown) => void;
  falharRede: () => void;
}
const chamadas: Chamada[] = [];
function fetchFalso(url: string | URL, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    chamadas.push({
      caminho: String(url).slice(BASE_API.length),
      corpo: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      idempotencia: headers["Idempotency-Key"] ?? null,
      responder: (status, corpo) =>
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: async () => corpo ?? null,
        } as Response),
      falharRede: () => reject(new TypeError("Failed to fetch")),
    });
  });
}
async function chamada(n: number): Promise<Chamada> {
  for (let i = 0; i < 5_000 && chamadas.length <= n; i++) await Promise.resolve();
  const c = chamadas[n];
  if (!c)
    throw new Error(
      `chamada #${n} não aconteceu; houve: ${chamadas.map((x) => x.caminho).join(", ")}`,
    );
  return c;
}
async function drenar(): Promise<void> {
  for (let i = 0; i < 5_000; i++) await Promise.resolve();
}
const erro = (status: number, code: string) => ({ statusCode: status, code, message: "fictício" });

// ─── Dados sintéticos ────────────────────────────────────────────────────────────────────────────────────────────

const access = (s: string) => `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ${s}In0.YXNzaW5hdHVyYS1zaW50ZXRpY2E`;
const refresh = (s: string) => `refresh_sintetico_${s}_0123456789abcdef`;
const tokens = (s: string, expiresIn = 900) => ({
  accessToken: access(s),
  refreshToken: refresh(s),
  expiresIn,
});

function sessaoV1(s: string, pendencia: SessaoV1["pendencia"] = null): SessaoV1 {
  return {
    v: 1,
    accessToken: access(s),
    refreshToken: refresh(s),
    expiresAt: 1_794_700_000_000,
    pendencia,
  };
}
/** Grava a sessão legada exatamente como a v0.1.3 faria. */
function legadoComo(s: SessaoV1): void {
  tokenStorageMod.restaurarSessaoPersistida({
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    expiresAt: s.expiresAt,
    pendenciaSerializada: s.pendencia
      ? JSON.stringify({ versao: 1, ...s.pendencia, estado: "pendente" })
      : null,
  });
}
function legadoAtual() {
  return {
    access: tokenStorage.get(),
    refresh: refreshTokenStorage.get(),
    expira: obterExpiraEm(),
  };
}
function marcador(): unknown {
  const bruto = marcadorSessaoNativaStorageAtual.get();
  return bruto ? JSON.parse(bruto) : null;
}

// ─── Ambiente ────────────────────────────────────────────────────────────────────────────────────────────────────

let nativo: NativoFalso;
const fetchOriginal = globalThis.fetch;
const metodosConsole = ["log", "info", "warn", "error", "debug"] as const;
const consoleOriginal = Object.fromEntries(metodosConsole.map((m) => [m, console[m]]));
let logs: unknown[][] = [];

/** "Abre o app": estado do serviço zerado, mesmo cofre e mesmo armazenamento legado (como um reinício). */
function abrirApp(): void {
  nativa.configurarSessaoNativaParaTestes({ desktop: () => true, cofre: () => cofreDoProcesso });
  cofreDoProcesso = criarCofreSessao(nativo);
}
let cofreDoProcesso = criarCofreSessao(new NativoFalso());

beforeAll(() => {
  Object.defineProperty(crypto.subtle, "digest", {
    value: digestEmMicrotarefa,
    configurable: true,
    writable: true,
  });
  globalThis.fetch = fetchFalso as typeof fetch;
  registerSessionHandlers({
    limparUsuario: () => {},
    limparCache: () => {},
    irParaLogin: () => {},
    rotaAtual: () => "/",
  });
});
afterAll(() => {
  delete (crypto.subtle as unknown as Record<string, unknown>)["digest"];
  globalThis.fetch = fetchOriginal;
  registerSessionHandlers(null);
  nativa.configurarSessaoNativaParaTestes(null);
});
beforeEach(() => {
  limparSessao();
  marcadorSessaoNativaStorageAtual.clear();
  chamadas.length = 0;
  nativo = new NativoFalso();
  abrirApp();
  logs = [];
  for (const m of metodosConsole) console[m] = (...a: unknown[]) => void logs.push(a);
});
afterEach(() => {
  for (const m of metodosConsole) console[m] = consoleOriginal[m] as never;
  expect(logs).toEqual([]); // nada registrado em log, em nenhum teste
});

// ─── Migração ────────────────────────────────────────────────────────────────────────────────────────────────────

describe("migração", () => {
  test("A — legado válido e cofre vazio: grava, CONFIRMA por leitura, compara; só então marca; legado preservado", async () => {
    const s = sessaoV1("a1");
    legadoComo(s);
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(nativo.comandos).toEqual(["sessao_carregar", "sessao_gravar", "sessao_carregar"]);
    expect(nativo.sessao()).toEqual(s);
    expect(marcador()).toEqual({ v: 1, estado: "migrada", vinculo: sha256(s.refreshToken) });
    expect(legadoAtual()).toEqual({
      access: s.accessToken,
      refresh: s.refreshToken,
      expira: s.expiresAt,
    });
  });

  test("migração com pendência idempotente: a pendência (mesmo vínculo) vai junto; de outro refresh, não", async () => {
    const p = {
      vinculo: sha256(refresh("p1")),
      chave: "6f1c8a2e-0b5d-4c3e-9a7f-2d4e6b8c0a1f",
      criadaEm: "2026-11-14T12:00:00.000Z",
    };
    legadoComo(sessaoV1("p1", p));
    await nativa.aguardarSessaoPreparada();
    expect(nativo.sessao()?.pendencia).toEqual(p);

    nativo = new NativoFalso();
    abrirApp();
    limparSessao();
    marcadorSessaoNativaStorageAtual.clear();
    legadoComo(sessaoV1("p2", { ...p, vinculo: sha256(refresh("outro")) }));
    await nativa.aguardarSessaoPreparada();
    expect(nativo.sessao()?.pendencia).toBeNull();
  });

  test("migração repetida (reabrir) é idempotente: nenhuma gravação a mais", async () => {
    legadoComo(sessaoV1("rep"));
    await nativa.aguardarSessaoPreparada();
    expect(nativo.gravacoes).toBe(1);
    abrirApp();
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    abrirApp();
    await nativa.aguardarSessaoPreparada();
    expect(nativo.gravacoes).toBe(1);
  });

  for (const [nome, falha, motivo] of [
    ["falha de gravação", (n: NativoFalso) => (n.falharGravacao = 1), "migracao_nao_confirmada"],
    ["falha de leitura APÓS a gravação", (n: NativoFalso) => n, "migracao_nao_confirmada"],
    ["conteúdo relido divergente", (n: NativoFalso) => n, "migracao_nao_confirmada"],
  ] as const) {
    test(`${nome}: NÃO marca como migrada, legado intacto, modo legado; a próxima abertura retoma`, async () => {
      const s = sessaoV1("falha");
      legadoComo(s);
      falha(nativo);
      if (nome.startsWith("falha de leitura")) {
        // a 1ª leitura (estado inicial) funciona; a de CONFIRMAÇÃO falha
        const original = nativo.invocar.bind(nativo);
        let leituras = 0;
        nativo.invocar = async (c, a) => {
          if (c === "sessao_carregar" && ++leituras === 2) throw "COFRE_INDISPONIVEL";
          return original(c, a);
        };
      }
      if (nome.startsWith("conteúdo")) {
        const original = nativo.invocar.bind(nativo);
        let leituras = 0;
        nativo.invocar = async (c, a) => {
          if (c === "sessao_carregar" && ++leituras === 2)
            return { conteudo: JSON.stringify(sessaoV1("outra")), seq: nativo.ultimoSeq };
          return original(c, a);
        };
      }
      expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "legado", motivo });
      expect(marcador()).toBeNull();
      expect(legadoAtual()).toEqual({
        access: s.accessToken,
        refresh: s.refreshToken,
        expira: s.expiresAt,
      });

      // Retomada: reabre com o cofre saudável → migra.
      nativo.invocar = NativoFalso.prototype.invocar.bind(nativo);
      abrirApp();
      expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
      expect(nativo.sessao()).toEqual(s);
      expect(marcador()).toEqual({ v: 1, estado: "migrada", vinculo: sha256(s.refreshToken) });
    });
  }

  test("encerramento DURANTE a migração (gravou, não marcou): a próxima abertura conclui sem nova gravação", async () => {
    const s = sessaoV1("crash");
    legadoComo(s);
    nativo.conteudo = JSON.stringify(s); // o cofre recebeu a gravação; o app fechou antes do marcador
    nativo.ultimoSeq = 1;
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(nativo.gravacoes).toBe(0);
    expect(marcador()).toEqual({ v: 1, estado: "migrada", vinculo: sha256(s.refreshToken) });
  });
});

// ─── Conflitos ───────────────────────────────────────────────────────────────────────────────────────────────────

describe("conflitos legado × cofre", () => {
  test("B — mesma sessão nos dois: usa, sem regravar; pendência que só existe no legado é levada ao cofre", async () => {
    const s = sessaoV1("b1");
    legadoComo(s);
    nativo.conteudo = JSON.stringify(s);
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(nativo.gravacoes).toBe(0);

    const p = {
      vinculo: sha256(refresh("b2")),
      chave: "6f1c8a2e-0b5d-4c3e-9a7f-2d4e6b8c0a1f",
      criadaEm: "2026-11-14T12:00:00.000Z",
    };
    nativo = new NativoFalso();
    nativo.conteudo = JSON.stringify(sessaoV1("b2"));
    abrirApp();
    legadoComo(sessaoV1("b2", p));
    await nativa.aguardarSessaoPreparada();
    expect(nativo.sessao()?.pendencia).toEqual(p);
  });

  test("B — sessões diferentes e o marcador aponta o cofre: o legado é mais novo e substitui o cofre (confirmado)", async () => {
    const antiga = sessaoV1("velha");
    const nova = sessaoV1("nova");
    nativo.conteudo = JSON.stringify(antiga);
    marcadorSessaoNativaStorageAtual.set(
      JSON.stringify({ v: 1, estado: "migrada", vinculo: sha256(antiga.refreshToken) }),
    );
    legadoComo(nova);
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(nativo.sessao()).toEqual(nova);
    expect(marcador()).toEqual({ v: 1, estado: "migrada", vinculo: sha256(nova.refreshToken) });
  });

  test("B — sessões diferentes sem como decidir: INDETERMINADO, nada sobrescrito nem apagado, modo legado", async () => {
    const noCofre = sessaoV1("cofre");
    const noLegado = sessaoV1("legado");
    nativo.conteudo = JSON.stringify(noCofre);
    legadoComo(noLegado);
    expect(await nativa.aguardarSessaoPreparada()).toEqual({
      modo: "legado",
      motivo: "sessoes_divergentes",
    });
    expect(nativo.sessao()).toEqual(noCofre);
    expect(legadoAtual().refresh).toBe(noLegado.refreshToken);
    expect(nativo.gravacoes).toBe(0);
    expect(nativo.comandos).not.toContain("sessao_apagar");
  });

  test("C — legado inválido e cofre válido: usa a sessão nativa (o espelho legado é regravado)", async () => {
    const s = sessaoV1("c1");
    nativo.conteudo = JSON.stringify(s);
    tokenStorage.set("token com espaco invalido");
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(legadoAtual()).toEqual({
      access: s.accessToken,
      refresh: s.refreshToken,
      expira: s.expiresAt,
    });
  });

  test("C — legado ausente sem marcador (dados do WebView apagados): usa a sessão nativa", async () => {
    const s = sessaoV1("c2");
    nativo.conteudo = JSON.stringify(s);
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(legadoAtual().refresh).toBe(s.refreshToken);
  });

  test("legado ausente com marcador 'migrada' (logout feito numa versão anterior): NÃO ressuscita; apaga o cofre", async () => {
    const s = sessaoV1("ressurreicao");
    nativo.conteudo = JSON.stringify(s);
    marcadorSessaoNativaStorageAtual.set(
      JSON.stringify({ v: 1, estado: "migrada", vinculo: sha256(s.refreshToken) }),
    );
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(legadoAtual().access).toBeNull();
    expect(nativo.sessao()).toBeNull();
    expect(marcador()).toEqual({ v: 1, estado: "encerrada" });
  });

  for (const [nome, preparar] of [
    ["cofre indisponível", (n: NativoFalso) => (n.falharLeitura = 1)],
    ["erro de IPC", (n: NativoFalso) => (n.falharIpc = 1)],
  ] as const) {
    test(`D/G — legado válido e ${nome}: NÃO é tratado como "sem sessão"; legado usado e intacto, modo legado`, async () => {
      const s = sessaoV1("d");
      legadoComo(s);
      preparar(nativo);
      expect(await nativa.aguardarSessaoPreparada()).toEqual({
        modo: "legado",
        motivo: "cofre_indisponivel",
      });
      expect(legadoAtual()).toEqual({
        access: s.accessToken,
        refresh: s.refreshToken,
        expira: s.expiresAt,
      });
      expect(nativo.gravacoes).toBe(0);
      expect(marcador()).toBeNull();
    });
  }

  test("E — ambos ausentes: sem sessão, modo nativo, nada gravado", async () => {
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(nativo.gravacoes).toBe(0);
    expect(legadoAtual().access).toBeNull();
  });

  test("F — ambos inválidos: nada é reconstruído nem gravado", async () => {
    nativo.conteudo = '{"v":1,"invalido":true}';
    tokenStorage.set("token com espaco");
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(nativo.gravacoes).toBe(0);
    expect(tokenStorage.get()).toBe("token com espaco");
    expect(refreshTokenStorage.get()).toBeNull();
  });

  test("web (fora do Tauri): nada muda — nenhum comando nativo, mesmo com sessão legada", async () => {
    nativa.configurarSessaoNativaParaTestes({ desktop: () => false, cofre: () => cofreDoProcesso });
    legadoComo(sessaoV1("web"));
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "web" });
    expect(await nativa.sincronizarSessaoNativa()).toBe(true);
    expect(await nativa.registrarEncerramentoNativo()).toBe(true);
    expect(nativo.comandos).toEqual([]);
    expect(marcador()).toBeNull();
  });
});

// ─── Autenticação ────────────────────────────────────────────────────────────────────────────────────────────────

async function login(s: string) {
  const p = authApi.login({ usuario: `${s}@ficticio.test`, senha: "ficticia" });
  (await chamada(chamadas.length)).responder(200, {
    data: { ...tokens(s), usuario: { id: `usr-${s}` } },
  });
  return p;
}

describe("autenticação integrada", () => {
  test("login com cofre disponível: sessão gravada e confirmada no cofre antes de o login terminar", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("l1");
    expect(nativo.sessao()?.refreshToken).toBe(refresh("l1"));
    expect(marcador()).toEqual({ v: 1, estado: "migrada", vinculo: sha256(refresh("l1")) });
    expect(nativa.estadoArmazenamento()).toEqual({ modo: "nativo" });
  });

  test("login com fallback legado: cofre falha → modo legado EXPLÍCITO; a sessão continua válida no legado", async () => {
    await nativa.aguardarSessaoPreparada();
    nativo.falharGravacao = 1;
    await login("l2");
    expect(nativa.estadoArmazenamento()).toEqual({ modo: "legado", motivo: "cofre_indisponivel" });
    expect(legadoAtual().refresh).toBe(refresh("l2"));
    expect(nativo.sessao()).toBeNull();
  });

  test("refresh com cofre: a PENDÊNCIA está no cofre antes do POST; o par novo é espelhado depois", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("r1");
    const n = chamadas.length;
    const req = apiClient.get("/vendas");
    (await chamada(n)).responder(401, erro(401, "UNAUTHORIZED"));
    const post = await chamada(n + 1);
    expect(post.caminho).toBe("/auth/refresh");
    expect(nativo.sessao()?.pendencia?.chave).toBe(post.idempotencia!); // persistida no cofre ANTES do envio
    post.responder(200, { data: tokens("r2") });
    (await chamada(n + 2)).responder(200, { data: [] });
    await req;
    await nativa.sincronizarSessaoNativa();
    expect(nativo.sessao()).toMatchObject({ refreshToken: refresh("r2"), pendencia: null });
    expect(marcador()).toEqual({ v: 1, estado: "migrada", vinculo: sha256(refresh("r2")) });
  });

  test("refresh com FALHA de persistência no cofre: a sessão segue (legado); a próxima abertura reconcilia", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("f1");
    const n = chamadas.length;
    nativo.falharGravacao = 99; // todas as gravações seguintes falham
    const req = apiClient.get("/vendas");
    (await chamada(n)).responder(401, erro(401, "UNAUTHORIZED"));
    (await chamada(n + 1)).responder(200, { data: tokens("f2") });
    (await chamada(n + 2)).responder(200, { data: [] });
    await req;
    expect(legadoAtual().refresh).toBe(refresh("f2"));
    expect(nativo.sessao()?.refreshToken).toBe(refresh("f1")); // o cofre ficou para trás
    // Reabertura com o cofre saudável: o marcador aponta f1 (cofre) → o legado (f2) é mais novo e prevalece.
    nativo.falharGravacao = 0;
    abrirApp();
    expect(await nativa.aguardarSessaoPreparada()).toEqual({ modo: "nativo" });
    expect(nativo.sessao()?.refreshToken).toBe(refresh("f2"));
  });

  test("recuperação idempotente após reabrir: a mesma chave persistida no cofre é reutilizada", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("i1");
    const n = chamadas.length;
    const req1 = apiClient.get("/vendas");
    (await chamada(n)).responder(401, erro(401, "UNAUTHORIZED"));
    const p1 = await chamada(n + 1);
    const chave = p1.idempotencia;
    p1.falharRede(); // resposta perdida
    await req1.catch(() => {});
    // "Reinício" com os dados do WebView perdidos (pior caso: legado E marcador) — o app reabre só com o cofre.
    // (Legado ausente com marcador presente significa logout feito por versão anterior — coberto em "conflitos".)
    limparSessao();
    marcadorSessaoNativaStorageAtual.clear();
    abrirApp();
    await nativa.aguardarSessaoPreparada();
    expect(lerRenovacaoPendente()?.chave).toBe(chave!);
    const req2 = apiClient.get("/vendas");
    (await chamada(n + 2)).responder(401, erro(401, "UNAUTHORIZED"));
    const p2 = await chamada(n + 3);
    expect(p2.idempotencia).toBe(chave);
    p2.responder(200, { data: tokens("i2") });
    (await chamada(n + 4)).responder(200, { data: [] });
    await req2;
  });

  test("logout: legado limpo, marcador 'encerrada' NA HORA, cofre apagado; reabrir não restaura", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("o1");
    const n = chamadas.length;
    const saida = authApi.logout();
    expect(marcador()).toEqual({ v: 1, estado: "encerrada" }); // síncrono
    expect(legadoAtual().access).toBeNull();
    (await chamada(n)).responder(200, { data: null });
    await saida;
    await nativa.sincronizarSessaoNativa();
    expect(nativo.sessao()).toBeNull();
    abrirApp();
    await nativa.aguardarSessaoPreparada();
    expect(legadoAtual().access).toBeNull();
  });

  test("logout com FALHA ao apagar o cofre: a sessão antiga NÃO é restaurada na reabertura (e é apagada então)", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("o2");
    nativo.falharExclusao = 1;
    const n = chamadas.length;
    const saida = authApi.logout();
    (await chamada(n)).responder(200, { data: null });
    await saida;
    await nativa.sincronizarSessaoNativa();
    expect(nativo.sessao()?.refreshToken).toBe(refresh("o2")); // continua lá…
    abrirApp();
    await nativa.aguardarSessaoPreparada();
    expect(legadoAtual().access).toBeNull(); // …mas não volta
    expect(nativo.sessao()).toBeNull(); // e é apagada na reabertura
  });

  for (const desktop of [true, false]) {
    test(`logout como o use-auth faz (authApi.logout + encerrarSessao em seguida): a revogação AINDA é enviada (${desktop ? "desktop" : "web"})`, async () => {
      nativa.configurarSessaoNativaParaTestes({
        desktop: () => desktop,
        cofre: () => cofreDoProcesso,
      });
      await nativa.aguardarSessaoPreparada();
      await login("rev");
      const n = chamadas.length;
      const saida = authApi.logout();
      const encerramento = encerrarSessao({ redirecionar: true }); // muda a geração durante a espera do envio
      const post = await chamada(n);
      expect(post.caminho).toBe("/auth/logout");
      expect(post.corpo).toEqual({ refreshToken: refresh("rev") });
      post.responder(200, { data: null });
      await Promise.all([saida, encerramento]);
    });
  }

  test("novo login depois do logout: a sessão nova vai para o cofre; nada do usuário anterior", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("u1");
    const n = chamadas.length;
    const saida = authApi.logout();
    (await chamada(n)).responder(200, { data: null });
    await saida;
    await login("u2");
    expect(nativo.sessao()).toMatchObject({ refreshToken: refresh("u2"), pendencia: null });
    expect(marcador()).toEqual({ v: 1, estado: "migrada", vinculo: sha256(refresh("u2")) });
  });

  test("resposta atrasada + troca de usuário: o refresh antigo de A não sobrescreve a sessão de B no cofre", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("ta");
    const n = chamadas.length;
    const reqA = apiClient.get("/vendas");
    reqA.catch(() => {});
    (await chamada(n)).responder(401, erro(401, "UNAUTHORIZED"));
    const refreshA = await chamada(n + 1);
    const saida = authApi.logout(); // espera a renovação de A
    const loginB = login("tb");
    await loginB;
    refreshA.responder(200, { data: tokens("ta-tardio") });
    for (let i = n + 3; i < n + 5; i += 1) (await chamada(i)).responder(200, { data: null });
    await saida;
    await reqA.catch(() => {});
    await nativa.sincronizarSessaoNativa();
    expect(nativo.sessao()?.refreshToken).toBe(refresh("tb"));
    expect(legadoAtual().refresh).toBe(refresh("tb"));
    expect(JSON.stringify(nativo.sessao())).not.toContain("ta-tardio");
  });
});

// ─── Concorrência e segurança ────────────────────────────────────────────────────────────────────────────────────

describe("concorrência e segurança", () => {
  test("duas sincronizações simultâneas: serializadas; o cofre termina igual ao legado mais recente", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("c1");
    tokenStorageMod.salvarSessao(tokens("c2"));
    const a = nativa.sincronizarSessaoNativa();
    tokenStorageMod.salvarSessao(tokens("c3"));
    const b = nativa.sincronizarSessaoNativa();
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(nativo.sessao()?.refreshToken).toBe(refresh("c3"));
  });

  test("refresh concorrente (dois 401): UMA renovação, UMA chave, a mesma no cofre", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("rc");
    const n = chamadas.length;
    const r1 = apiClient.get("/vendas");
    const r2 = apiClient.get("/produtos");
    (await chamada(n)).responder(401, erro(401, "UNAUTHORIZED"));
    (await chamada(n + 1)).responder(401, erro(401, "UNAUTHORIZED"));
    const post = await chamada(n + 2);
    await drenar();
    expect(chamadas.filter((c) => c.caminho === "/auth/refresh")).toHaveLength(1);
    expect(nativo.sessao()?.pendencia?.chave).toBe(post.idempotencia!);
    post.responder(200, { data: tokens("rc2") });
    (await chamada(n + 3)).responder(200, { data: 1 });
    (await chamada(n + 4)).responder(200, { data: 2 });
    await Promise.all([r1, r2]);
  });

  test("logout durante o refresh: a resposta tardia não volta ao cofre nem reescreve o marcador", async () => {
    await nativa.aguardarSessaoPreparada();
    await login("ld");
    const n = chamadas.length;
    const req = apiClient.get("/vendas");
    req.catch(() => {});
    (await chamada(n)).responder(401, erro(401, "UNAUTHORIZED"));
    const post = await chamada(n + 1);
    const saida = authApi.logout();
    post.responder(200, { data: tokens("ld-tardio") });
    for (let i = n + 2; i < n + 4; i += 1) (await chamada(i)).responder(200, { data: null });
    await saida;
    await nativa.sincronizarSessaoNativa();
    expect(nativo.sessao()).toBeNull();
    expect(marcador()).toEqual({ v: 1, estado: "encerrada" });
  });

  test("nenhuma exclusão prematura do legado: migração, falhas e divergência nunca apagam a sessão legada", async () => {
    const s = sessaoV1("preserva");
    for (const preparar of [
      () => {},
      () => (nativo.falharGravacao = 1),
      () => (nativo.falharIpc = 1),
      () => (nativo.conteudo = JSON.stringify(sessaoV1("divergente"))),
    ]) {
      nativo = new NativoFalso();
      abrirApp();
      limparSessao();
      marcadorSessaoNativaStorageAtual.clear();
      legadoComo(s);
      preparar();
      await nativa.aguardarSessaoPreparada();
      expect(legadoAtual()).toEqual({
        access: s.accessToken,
        refresh: s.refreshToken,
        expira: s.expiresAt,
      });
      expect(renovacaoPendenteStorageAtual.get()).toBeNull();
    }
  });

  test("marcador e estado nunca contêm tokens ou chaves", async () => {
    const p = {
      vinculo: sha256(refresh("seg")),
      chave: "6f1c8a2e-0b5d-4c3e-9a7f-2d4e6b8c0a1f",
      criadaEm: "2026-11-14T12:00:00.000Z",
    };
    legadoComo(sessaoV1("seg", p));
    await nativa.aguardarSessaoPreparada();
    const textos = [
      String(marcadorSessaoNativaStorageAtual.get()),
      JSON.stringify(nativa.estadoArmazenamento()),
    ];
    for (const t of textos) {
      for (const segredo of [access("seg"), refresh("seg"), p.chave])
        expect(t).not.toContain(segredo);
    }
  });
});
