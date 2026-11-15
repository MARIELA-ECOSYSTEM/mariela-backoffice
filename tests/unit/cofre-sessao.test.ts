/**
 * Fase 22.8.8.3 (M3) — testes do cliente TypeScript do cofre nativo (`src/services/auth/cofre-sessao.ts`).
 * Executar com: `bun test tests/unit`
 *
 * SEM Credential Manager real e sem Tauri: o processo nativo é um FALSO que reproduz as regras dos comandos Rust da
 * Fase 22.8.8.2 (`src-tauri/src/sessao.rs`) — validação, `seq` estritamente crescente, `seq` consumido na tentativa
 * mesmo quando o cofre falha — e registra cada invocação. Todos os valores são sintéticos.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  TAMANHO_MAXIMO_CONTEUDO,
  criarCofreSessao,
  sessaoV1Valida,
  transporteTauri,
  type CodigoErroCofre,
  type SessaoV1,
  type TransporteCofre,
} from "@/services/auth/cofre-sessao";

const ACCESS = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzaW50ZXRpY28ifQ.c2ludGV0aWNvLWFzc2luYXR1cmE";
const REFRESH = "refresh_sintetico_0123456789abcdefghijklmnopq";
const CHAVE = "6f1c8a2e-0b5d-4c3e-9a7f-2d4e6b8c0a1f";
const VINCULO = "ab".repeat(32);

function sessao(extra: Partial<SessaoV1> = {}): SessaoV1 {
  return {
    v: 1,
    accessToken: ACCESS,
    refreshToken: REFRESH,
    expiresAt: 1_794_700_000_000,
    pendencia: null,
    ...extra,
  };
}
function sessaoComPendencia(): SessaoV1 {
  return sessao({
    pendencia: { vinculo: VINCULO, chave: CHAVE, criadaEm: "2026-11-14T12:00:00.000Z" },
  });
}

// ─── Processo nativo falso (regras da M2) ────────────────────────────────────────────────────────────────────────

interface Chamada {
  comando: string;
  argumentos?: Record<string, unknown>;
}

class NativoFalso implements TransporteCofre {
  noTauri = true;
  ultimoSeq = 0;
  conteudo: string | null = null;
  chamadas: Chamada[] = [];
  /** Falha do Credential Manager na próxima gravação/exclusão (o seq JÁ foi consumido, como no Rust). */
  cofreFalhaNaProxima = false;
  /** Rejeição arbitrária da próxima invocação, ANTES de chegar ao "Rust" (IPC, ACL, comando inexistente…). */
  rejeitarProxima: unknown = undefined;
  /** Substitui a resposta do próximo `sessao_carregar`. */
  respostaCarregar: unknown = undefined;

  disponivel(): boolean {
    return this.noTauri;
  }

  async invocar(comando: string, argumentos?: Record<string, unknown>): Promise<unknown> {
    this.chamadas.push({ comando, argumentos });
    if (this.rejeitarProxima !== undefined) {
      const erro = this.rejeitarProxima;
      this.rejeitarProxima = undefined;
      throw erro;
    }
    if (comando === "sessao_carregar") {
      if (this.respostaCarregar !== undefined) {
        const r = this.respostaCarregar;
        this.respostaCarregar = undefined;
        return r;
      }
      return { conteudo: this.conteudo, seq: this.ultimoSeq };
    }
    const seq = argumentos?.["seq"] as number;
    if (comando === "sessao_gravar") {
      const conteudo = argumentos?.["conteudo"] as string;
      if (new TextEncoder().encode(conteudo).length > TAMANHO_MAXIMO_CONTEUDO)
        throw "TAMANHO_EXCEDIDO";
      if (!sessaoV1Valida(JSON.parse(conteudo))) throw "FORMATO_INVALIDO";
    }
    if (seq <= this.ultimoSeq) throw "GRAVACAO_OBSOLETA";
    this.ultimoSeq = seq;
    if (this.cofreFalhaNaProxima) {
      this.cofreFalhaNaProxima = false;
      throw "COFRE_INDISPONIVEL";
    }
    if (comando === "sessao_gravar") this.conteudo = argumentos?.["conteudo"] as string;
    else this.conteudo = null;
    return null;
  }

  /** Todos os `seq` enviados em gravações/exclusões, na ordem. */
  seqsEnviados(): number[] {
    return this.chamadas
      .filter((c) => c.comando !== "sessao_carregar")
      .map((c) => c.argumentos!["seq"] as number);
  }
}

const erroDe = (r: { ok: boolean; codigo?: CodigoErroCofre }) => (r.ok ? null : r.codigo);

// ─── Observadores de segurança: console e Web Storage ────────────────────────────────────────────────────────────

const metodosConsole = ["log", "info", "warn", "error", "debug", "trace"] as const;
const consoleOriginal = Object.fromEntries(metodosConsole.map((m) => [m, console[m]]));
let registrosDeLog: unknown[][] = [];
const acessosStorage: string[] = [];
function storageObservado(nome: string): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      acessosStorage.push(`${nome}.length`);
      return dados.size;
    },
    key: (i) => (acessosStorage.push(`${nome}.key`), [...dados.keys()][i] ?? null),
    getItem: (k) => (acessosStorage.push(`${nome}.getItem`), dados.get(k) ?? null),
    setItem: (k, v) => (acessosStorage.push(`${nome}.setItem`), void dados.set(k, v)),
    removeItem: (k) => (acessosStorage.push(`${nome}.removeItem`), void dados.delete(k)),
    clear: () => (acessosStorage.push(`${nome}.clear`), dados.clear()),
  };
}
const g = globalThis as { localStorage?: Storage; sessionStorage?: Storage };
const storagesOriginais = { local: g.localStorage, session: g.sessionStorage };

beforeEach(() => {
  registrosDeLog = [];
  for (const m of metodosConsole)
    console[m] = (...args: unknown[]) => void registrosDeLog.push(args);
  acessosStorage.length = 0;
  g.localStorage = storageObservado("localStorage");
  g.sessionStorage = storageObservado("sessionStorage");
});

afterEach(() => {
  for (const m of metodosConsole) console[m] = consoleOriginal[m] as never;
  g.localStorage = storagesOriginais.local;
  g.sessionStorage = storagesOriginais.session;
  // Garantias válidas para TODO teste deste arquivo: nada em log e nenhum acesso ao Web Storage.
  expect(registrosDeLog).toEqual([]);
  expect(acessosStorage).toEqual([]);
});

// ─── Contrato ────────────────────────────────────────────────────────────────────────────────────────────────────

describe("contrato v1 (espelha a validação do Rust)", () => {
  test("sessões válidas, com e sem pendência; ISO com e sem milissegundos", () => {
    expect(sessaoV1Valida(sessao())).toBe(true);
    expect(sessaoV1Valida(sessaoComPendencia())).toBe(true);
    expect(
      sessaoV1Valida(
        sessao({ pendencia: { vinculo: VINCULO, chave: CHAVE, criadaEm: "2026-11-14T12:00:00Z" } }),
      ),
    ).toBe(true);
  });

  test("versão desconhecida, campos ausentes, campos desconhecidos e tipos errados são recusados", () => {
    const base = sessaoComPendencia() as unknown as Record<string, unknown>;
    const invalidos: unknown[] = [
      null,
      [],
      "texto",
      { ...base, v: 2 },
      { ...base, v: "1" },
      { ...base, extra: true },
      { ...base, accessToken: "" },
      { ...base, accessToken: "com espaco" },
      { ...base, refreshToken: "curto" },
      { ...base, refreshToken: "refresh.com.ponto.0123456789abcdef" },
      { ...base, expiresAt: "1794700000000" },
      { ...base, expiresAt: -1 },
      { ...base, expiresAt: 1.5 },
      { ...base, expiresAt: 32_503_680_000_001 }, // 1 ms acima do teto (01/01/3000)
    ];
    for (const campo of ["v", "accessToken", "refreshToken", "expiresAt", "pendencia"]) {
      const sem = { ...base };
      delete sem[campo];
      invalidos.push(sem);
    }
    for (const valor of invalidos) expect(sessaoV1Valida(valor)).toBe(false);
  });

  test("pendência inválida é recusada (vínculo, chave, data, campos)", () => {
    const p = sessaoComPendencia().pendencia!;
    const invalidas: unknown[] = [
      "texto",
      [],
      { ...p, vinculo: "abc" },
      { ...p, vinculo: "AB".repeat(32) },
      { ...p, chave: CHAVE.toUpperCase() },
      { ...p, chave: "00000000-0000-0000-0000-000000000000" },
      { ...p, chave: "6f1c8a2e-0b5d-4c3e-1a7f-2d4e6b8c0a1f" },
      { ...p, criadaEm: "14/11/2026" },
      { ...p, criadaEm: "2026-11-14T12:00:00.000" },
      { ...p, extra: 1 },
      { vinculo: p.vinculo, chave: p.chave },
    ];
    for (const pendencia of invalidas)
      expect(sessaoV1Valida({ ...sessao(), pendencia })).toBe(false);
  });
});

describe("carregar", () => {
  test("sessão válida e ausência de sessão; o seq nativo é adotado", async () => {
    const nativo = new NativoFalso();
    nativo.conteudo = JSON.stringify(sessaoComPendencia());
    nativo.ultimoSeq = 5;
    const cofre = criarCofreSessao(nativo);
    expect(await cofre.carregar()).toEqual({ ok: true, valor: sessaoComPendencia() });
    await cofre.gravar(sessao());
    expect(nativo.seqsEnviados()).toEqual([6]); // continuou do seq lido, sem nova leitura

    const vazio = new NativoFalso();
    expect(await criarCofreSessao(vazio).carregar()).toEqual({ ok: true, valor: null });
  });

  test("resposta fora do contrato → RESPOSTA_INVALIDA (e o seq fica incerto)", async () => {
    const respostas: unknown[] = [
      null,
      "texto",
      { conteudo: null },
      { seq: 1 },
      { conteudo: null, seq: 1, extra: true },
      { conteudo: null, seq: -1 },
      { conteudo: null, seq: 1.5 },
      { conteudo: null, seq: "1" },
      { conteudo: 42, seq: 1 },
    ];
    for (const resposta of respostas) {
      const nativo = new NativoFalso();
      nativo.respostaCarregar = resposta;
      const cofre = criarCofreSessao(nativo);
      expect(erroDe(await cofre.carregar())).toBe("RESPOSTA_INVALIDA");
    }
  });

  test("conteúdo do cofre fora do v1 (JSON inválido, versão, campos, pendência) → RESPOSTA_INVALIDA", async () => {
    const conteudos = [
      "{nao json",
      JSON.stringify({ ...sessao(), v: 2 }),
      JSON.stringify({ ...sessao(), extra: 1 }),
      JSON.stringify({ v: 1, accessToken: ACCESS, refreshToken: REFRESH, expiresAt: 1 }),
      JSON.stringify({
        ...sessao(),
        pendencia: { vinculo: "x", chave: CHAVE, criadaEm: "2026-11-14T12:00:00Z" },
      }),
    ];
    for (const conteudo of conteudos) {
      const nativo = new NativoFalso();
      nativo.conteudo = conteudo;
      expect(erroDe(await criarCofreSessao(nativo).carregar())).toBe("RESPOSTA_INVALIDA");
    }
  });
});

// ─── Comandos ────────────────────────────────────────────────────────────────────────────────────────────────────

describe("comandos", () => {
  test("gravar e apagar: argumentos exatos do contrato nativo ({ conteudo, seq } / { seq })", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    expect(await cofre.gravar(sessaoComPendencia())).toEqual({ ok: true, valor: undefined });
    expect(nativo.conteudo).toBe(JSON.stringify(sessaoComPendencia()));
    expect(await cofre.apagar()).toEqual({ ok: true, valor: undefined });
    expect(nativo.conteudo).toBeNull();
    expect(nativo.chamadas).toEqual([
      { comando: "sessao_carregar", argumentos: undefined },
      {
        comando: "sessao_gravar",
        argumentos: { conteudo: JSON.stringify(sessaoComPendencia()), seq: 1 },
      },
      { comando: "sessao_apagar", argumentos: { seq: 2 } },
    ]);
  });

  test("erro nativo do contrato é repassado como código (COFRE_INDISPONIVEL)", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    await cofre.carregar();
    nativo.cofreFalhaNaProxima = true;
    expect(erroDe(await cofre.gravar(sessao()))).toBe("COFRE_INDISPONIVEL");
    nativo.rejeitarProxima = "COFRE_INDISPONIVEL";
    expect(erroDe(await cofre.carregar())).toBe("COFRE_INDISPONIVEL");
  });

  test("comando indisponível, negado pela ACL, falha de IPC ou exceção → FALHA_DE_INVOCACAO (sem repassar a mensagem)", async () => {
    const rejeicoes: unknown[] = [
      "command sessao_gravar not found",
      "sessao_gravar not allowed. Command not found",
      new Error(`falha de IPC com dados ${REFRESH}`),
      { mensagem: ACCESS },
      null,
    ];
    for (const rejeicao of rejeicoes) {
      const nativo = new NativoFalso();
      const cofre = criarCofreSessao(nativo);
      await cofre.carregar();
      nativo.rejeitarProxima = rejeicao;
      const r = await cofre.gravar(sessao());
      expect(r).toEqual({ ok: false, codigo: "FALHA_DE_INVOCACAO" });
      expect(JSON.stringify(r)).not.toContain(REFRESH);
      expect(JSON.stringify(r)).not.toContain(ACCESS);
    }
  });

  test("ambiente web (fora do Tauri): AMBIENTE_SEM_COFRE em tudo, sem invocar nada e sem simular sucesso", async () => {
    const nativo = new NativoFalso();
    nativo.noTauri = false;
    const cofre = criarCofreSessao(nativo);
    expect(await cofre.carregar()).toEqual({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
    expect(await cofre.gravar(sessao())).toEqual({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
    expect(await cofre.apagar()).toEqual({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
    expect(nativo.chamadas).toEqual([]);
  });

  test("transporte PADRÃO fora do Tauri (este processo): isTauri() é falso e nada é invocado", async () => {
    expect(transporteTauri.disponivel()).toBe(false);
    const cofre = criarCofreSessao(); // transporte oficial (@tauri-apps/api/core)
    expect(await cofre.carregar()).toEqual({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
    expect(await cofre.gravar(sessao())).toEqual({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
    expect(await cofre.apagar()).toEqual({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
  });

  test("validação local ANTES de invocar: formato inválido e acima de 2.560 bytes não invocam nem consomem seq", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    await cofre.carregar();
    expect(await cofre.gravar({ ...sessao(), v: 2 } as unknown as SessaoV1)).toEqual({
      ok: false,
      codigo: "FORMATO_INVALIDO",
    });
    const grande = sessao({ accessToken: "a".repeat(2048), refreshToken: "r".repeat(512) });
    expect(new TextEncoder().encode(JSON.stringify(grande)).length).toBeGreaterThan(
      TAMANHO_MAXIMO_CONTEUDO,
    );
    expect(await cofre.gravar(grande)).toEqual({ ok: false, codigo: "TAMANHO_EXCEDIDO" });
    expect(nativo.chamadas.map((c) => c.comando)).toEqual(["sessao_carregar"]);
    await cofre.gravar(sessao());
    expect(nativo.seqsEnviados()).toEqual([1]); // as recusas locais não consumiram seq
  });

  test("conteúdo no limite (2.560 bytes) é aceito", async () => {
    const base = JSON.stringify(sessaoComPendencia());
    let falta = TAMANHO_MAXIMO_CONTEUDO - new TextEncoder().encode(base).length;
    const extraRefresh = Math.min(falta, 512 - REFRESH.length);
    falta -= extraRefresh;
    const noLimite = sessao({
      ...sessaoComPendencia(),
      accessToken: ACCESS + "a".repeat(falta),
      refreshToken: REFRESH + "r".repeat(extraRefresh),
    });
    expect(new TextEncoder().encode(JSON.stringify(noLimite)).length).toBe(TAMANHO_MAXIMO_CONTEUDO);
    const nativo = new NativoFalso();
    expect(await criarCofreSessao(nativo).gravar(noLimite)).toEqual({ ok: true, valor: undefined });
  });
});

// ─── Sequência e fila ────────────────────────────────────────────────────────────────────────────────────────────

describe("sequência", () => {
  test("primeira operação sem leitura prévia: lê o seq nativo antes; gravações e exclusões crescem de 1 em 1", async () => {
    const nativo = new NativoFalso();
    nativo.ultimoSeq = 41; // ex.: a página foi recarregada no mesmo processo
    const cofre = criarCofreSessao(nativo);
    await cofre.gravar(sessao());
    await cofre.apagar();
    await cofre.gravar(sessaoComPendencia());
    expect(nativo.chamadas[0]!.comando).toBe("sessao_carregar");
    expect(nativo.seqsEnviados()).toEqual([42, 43, 44]);
  });

  test("tentativa obsoleta (outro contexto avançou o seq): GRAVACAO_OBSOLETA e a próxima operação RELÊ antes", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    await cofre.gravar(sessao()); // seq 1
    nativo.ultimoSeq = 10; // outro contexto JS no mesmo processo
    expect(erroDe(await cofre.gravar(sessaoComPendencia()))).toBe("GRAVACAO_OBSOLETA"); // tentou 2
    expect(await cofre.gravar(sessaoComPendencia())).toEqual({ ok: true, valor: undefined });
    expect(nativo.chamadas.map((c) => c.comando)).toEqual([
      "sessao_carregar",
      "sessao_gravar",
      "sessao_gravar",
      "sessao_carregar", // releitura por seq incerto
      "sessao_gravar",
    ]);
    expect(nativo.seqsEnviados()).toEqual([1, 2, 11]);
  });

  test("falha DEPOIS de consumir o seq (cofre indisponível): o seq não é reutilizado e não há releitura", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    await cofre.gravar(sessao()); // 1
    nativo.cofreFalhaNaProxima = true;
    expect(erroDe(await cofre.gravar(sessaoComPendencia()))).toBe("COFRE_INDISPONIVEL"); // 2 consumido
    expect(await cofre.gravar(sessaoComPendencia())).toEqual({ ok: true, valor: undefined }); // 3
    expect(nativo.seqsEnviados()).toEqual([1, 2, 3]);
    expect(nativo.chamadas.filter((c) => c.comando === "sessao_carregar")).toHaveLength(1);
  });

  test("falha de invocação torna o seq incerto: relê e continua acima do valor nativo", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    await cofre.gravar(sessao()); // 1
    nativo.rejeitarProxima = "IPC caiu";
    expect(erroDe(await cofre.apagar())).toBe("FALHA_DE_INVOCACAO"); // tentou 2, não chegou ao "Rust"
    await cofre.apagar();
    expect(nativo.chamadas.map((c) => c.comando).slice(-2)).toEqual([
      "sessao_carregar",
      "sessao_apagar",
    ]);
    expect(nativo.seqsEnviados()).toEqual([1, 2, 2]);
    // O seq 2 só foi repetido porque a releitura provou que o nativo nunca o recebeu (último aceito = 1).
    expect(nativo.ultimoSeq).toBe(2);
  });

  test("releitura com conteúdo inválido no cofre ainda sincroniza o seq e permite sobrescrever", async () => {
    const nativo = new NativoFalso();
    nativo.conteudo = "{corrompido";
    nativo.ultimoSeq = 7;
    const cofre = criarCofreSessao(nativo);
    expect(await cofre.gravar(sessao())).toEqual({ ok: true, valor: undefined });
    expect(nativo.seqsEnviados()).toEqual([8]);
  });

  test("releitura que falha impede a operação, sem invocar gravação com seq inventado", async () => {
    const nativo = new NativoFalso();
    nativo.rejeitarProxima = "COFRE_INDISPONIVEL";
    const cofre = criarCofreSessao(nativo);
    expect(erroDe(await cofre.gravar(sessao()))).toBe("COFRE_INDISPONIVEL");
    expect(nativo.chamadas.map((c) => c.comando)).toEqual(["sessao_carregar"]);
  });

  test("operações concorrentes: enfileiradas, na ordem de chegada, sem seq repetido; a mais recente prevalece", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    const ops: Promise<unknown>[] = [];
    const esperado: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      if (i % 3 === 2) {
        ops.push(cofre.apagar());
        esperado.push("apagar");
      } else {
        const s = sessao({ expiresAt: 1_794_700_000_000 + i });
        ops.push(cofre.gravar(s));
        esperado.push(JSON.stringify(s));
      }
    }
    ops.push(cofre.gravar(sessaoComPendencia()));
    const resultados = await Promise.all(ops);
    expect(resultados.every((r) => (r as { ok: boolean }).ok)).toBe(true);
    const seqs = nativo.seqsEnviados();
    expect(seqs).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(new Set(seqs).size).toBe(seqs.length);
    const mutacoes = nativo.chamadas.filter((c) => c.comando !== "sessao_carregar");
    expect(
      mutacoes
        .slice(0, 20)
        .map((c) => (c.comando === "sessao_apagar" ? "apagar" : c.argumentos!["conteudo"])),
    ).toEqual(esperado);
    expect(nativo.conteudo).toBe(JSON.stringify(sessaoComPendencia()));
  });

  test("uma operação só começa quando a anterior termina (fila real, mesmo com invocação lenta)", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    await cofre.carregar();
    let liberar!: () => void;
    const portao = new Promise<void>((ok) => (liberar = ok));
    const invocarOriginal = nativo.invocar.bind(nativo);
    let emAndamento = 0;
    let maximoSimultaneo = 0;
    const iniciadas: unknown[] = [];
    nativo.invocar = async (comando, argumentos) => {
      iniciadas.push(argumentos?.["seq"]);
      emAndamento += 1;
      maximoSimultaneo = Math.max(maximoSimultaneo, emAndamento);
      try {
        if (argumentos?.["seq"] === 1) await portao; // a primeira gravação fica "presa" no nativo
        return await invocarOriginal(comando, argumentos);
      } finally {
        emAndamento -= 1;
      }
    };
    const a = cofre.gravar(sessao());
    const b = cofre.apagar();
    const c = cofre.gravar(sessaoComPendencia());
    try {
      for (let i = 0; i < 50; i += 1) await Promise.resolve();
      expect(iniciadas).toEqual([1]); // b e c esperam a terminar
    } finally {
      liberar();
      await Promise.all([a, b, c]);
    }
    expect(iniciadas).toEqual([1, 2, 3]);
    expect(maximoSimultaneo).toBe(1);
    expect(nativo.seqsEnviados()).toEqual([1, 2, 3]);
  });
});

// ─── Segurança e isolamento ──────────────────────────────────────────────────────────────────────────────────────

describe("segurança e isolamento", () => {
  test("resultados de erro nunca contêm tokens, chave idempotente ou conteúdo da sessão", async () => {
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    const resultados: unknown[] = [];
    nativo.conteudo = JSON.stringify({ ...sessaoComPendencia(), v: 9 });
    resultados.push(await cofre.carregar());
    nativo.cofreFalhaNaProxima = true;
    resultados.push(await cofre.gravar(sessaoComPendencia()));
    nativo.rejeitarProxima = new Error(`vazou ${ACCESS} ${REFRESH} ${CHAVE}`);
    resultados.push(await cofre.gravar(sessaoComPendencia()));
    resultados.push(
      await cofre.gravar({ ...sessaoComPendencia(), extra: CHAVE } as unknown as SessaoV1),
    );
    for (const r of resultados) {
      expect((r as { ok: boolean }).ok).toBe(false);
      const texto = JSON.stringify(r);
      for (const segredo of [ACCESS, REFRESH, CHAVE, VINCULO]) expect(texto).not.toContain(segredo);
      expect(Object.keys(r as object).sort()).toEqual(["codigo", "ok"]);
    }
    // (o afterEach também prova: nenhum console.* foi chamado e nenhum Web Storage foi tocado)
  });

  test("o módulo não altera o armazenamento ATUAL da sessão (token-storage) nem o Web Storage", async () => {
    const tokenStorage = await import("@/services/auth/token-storage");
    tokenStorage.salvarSessao({
      accessToken: "access-atual",
      refreshToken: "refresh-atual",
      expiresIn: 900,
    });
    const antes = {
      access: tokenStorage.tokenStorage.get(),
      refresh: tokenStorage.refreshTokenStorage.get(),
      expira: tokenStorage.obterExpiraEm(),
    };
    const nativo = new NativoFalso();
    const cofre = criarCofreSessao(nativo);
    await cofre.carregar();
    await cofre.gravar(sessaoComPendencia());
    await cofre.apagar();
    expect({
      access: tokenStorage.tokenStorage.get(),
      refresh: tokenStorage.refreshTokenStorage.get(),
      expira: tokenStorage.obterExpiraEm(),
    }).toEqual(antes);
    tokenStorage.limparSessao();
  });

  test("importar o módulo não invoca nada nem cria instância global", async () => {
    const modulo = await import("@/services/auth/cofre-sessao");
    expect(Object.keys(modulo).sort()).toEqual([
      "TAMANHO_MAXIMO_CONTEUDO",
      "criarCofreSessao",
      "sessaoV1Valida",
      "transporteTauri",
    ]);
  });

  test("nenhum código do fluxo atual de autenticação importa o módulo novo (isolamento até a M4)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raiz = join(import.meta.dir, "..", "..", "src");
    const importadores: string[] = [];
    const visitar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) visitar(caminho);
        else if (/\.(ts|tsx)$/.test(nome) && !caminho.endsWith("cofre-sessao.ts")) {
          if (readFileSync(caminho, "utf8").includes("cofre-sessao")) importadores.push(caminho);
        }
      }
    };
    visitar(raiz);
    expect(importadores).toEqual([]);
  });
});
