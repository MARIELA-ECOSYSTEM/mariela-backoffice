/**
 * Fase 22.8.9.9.3 — persistência DURÁVEL das confirmações de upload de mídia pendentes.
 * Executar com: `bun test tests/unit`
 *
 * O armazenamento durável é um `Storage` em memória que sobrevive à "reabertura" (um repositório novo sobre o mesmo
 * meio), com as mesmas regras do Rust (`confirmacoes_midia.rs`, testado com `cargo test`). Backend: Mock API da
 * galeria + armazenamento simulado. Nenhuma rede, nenhum R2, nada do Credential Manager. Dados sintéticos.
 */
import { beforeEach, describe, expect, test } from "bun:test";

process.env.VITE_USE_MOCK_API = "false";
process.env.VITE_API_URL = "http://api.ficticia.invalid/api/v1";

const { ApiError } = await import("@/types/api");
const { handleMockRequest } = await import("@/services/mock/mock-transport");
const { db } = await import("@/services/mock/db");
const armazenamento = await import("@/services/mock/armazenamento-midia.mock");
const { reiniciarGaleriaMock } = await import("@/services/mock/galeria.mock");
const envio = await import("@/services/midia/envio-midia");
const registro = await import("@/services/midia/registro-confirmacoes");
type ApiGaleriaEnvio = import("@/services/midia/envio-midia").ApiGaleriaEnvio;
type DependenciasEnvio = import("@/services/midia/envio-midia").DependenciasEnvio;
type HttpMethod = import("@/services/api/client").HttpMethod;
type Produto = import("@/types/produto").Produto;

async function mock<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  return (await handleMockRequest<T>({ method, path, params: {}, body, token: "token-ficticio" }))
    .data;
}

/** API da galeria na Mock API, registrando cada chamada (método + rota curta). */
function apiMock(chamadas: string[]): ApiGaleriaEnvio {
  return {
    solicitarUpload: (id, p) => (
      chamadas.push("POST solicitar"),
      mock("POST", `/produtos/${id}/midias/uploads`, p)
    ),
    confirmarUpload: (id, u, p = {}) => (
      chamadas.push(`POST confirmar ${JSON.stringify(p)}`),
      mock("POST", `/produtos/${id}/midias/uploads/${u}/confirmacao`, p)
    ),
    listar: (id) => (chamadas.push("GET galeria"), mock("GET", `/produtos/${id}/midias`)),
  };
}

/** Um "computador": o meio durável sobrevive às aberturas do app. */
class Computador {
  storage = registro.criarStorageMemoria();
  falharGravacao = false;
  armazenamento(): import("@/services/midia/registro-confirmacoes").ArmazenamentoConfirmacoes {
    const base = registro.criarArmazenamentoConfirmacoesSobreStorage(() => this.storage, "memoria");
    return {
      ...base,
      gravar: async (u, c) =>
        this.falharGravacao ? { ok: false, codigo: "INDISPONIVEL" } : base.gravar(u, c),
    };
  }
}

let sessaoAtiva = true;
let geracao = 1;
function abrirApp(
  pc: Computador,
  chamadas: string[],
  extra: Partial<DependenciasEnvio> = {},
): DependenciasEnvio {
  return {
    api: apiMock(chamadas),
    transporte: (req) => armazenamento.receberEnvioMock(req),
    pendencias: new envio.RegistroEnviosPendentes(pc.armazenamento()),
    sessao: { geracao: () => geracao, ativa: () => sessaoAtiva },
    agora: () => Date.now(),
    ...extra,
  };
}

const jpg = (n = 1) => new File([new Uint8Array(512)], `foto-${n}.jpg`, { type: "image/jpeg" });
const confirmar = (r: { uploadId: string }) => ({ uploadId: r.uploadId });

let produto: Produto;
let outro: Produto;
beforeEach(() => {
  sessaoAtiva = true;
  geracao = 1;
  armazenamento.reiniciarArmazenamentoMock();
  armazenamento.definirRelogioMidiaMock(null);
  reiniciarGaleriaMock();
  [produto, outro] = [db.produtos[0]!, db.produtos[1]!];
  for (const p of [produto, outro]) {
    p.midias = [];
    p.midiaPrincipalId = null;
  }
});

/** Deixa uma confirmação pendente no computador (a mídia é gravada e a resposta "se perde", ou nem é gravada). */
async function deixarPendente(
  pc: Computador,
  falha: "confirmacao-gravar-e-503" | "confirmacao-rede",
  p = produto,
  n = 1,
) {
  const chamadas: string[] = [];
  armazenamento.simularFalhasDeMidia([falha]);
  const r = await envio.enviarMidia(
    { produtoId: p.id, arquivo: jpg(n), kind: "image", principal: true },
    abrirApp(pc, chamadas),
  );
  expect(r.estado).toBe("confirmacao_pendente");
  return { ...(r as { uploadId: string }), chamadas };
}

describe("registro durável antes da confirmação", () => {
  test("1 e 2. o registro existe ANTES do POST de confirmação e só tem os campos do formato (nada de URL, JWT, segredo)", async () => {
    const pc = new Computador();
    const chamadas: string[] = [];
    let noMomentoDoPost: string[] = [];
    const d = abrirApp(pc, chamadas);
    const api = d.api;
    d.api = {
      ...api,
      confirmarUpload: async (...a) => {
        noMomentoDoPost = Object.keys(
          Object.fromEntries([...Array(pc.storage.length)].map((_, i) => [pc.storage.key(i)!, 1])),
        );
        const bruto = pc.storage.getItem(noMomentoDoPost[0]!)!;
        expect(JSON.parse(bruto)).toMatchObject({
          estado: "confirmando",
          uploadId: a[1],
          confirmacao: { principal: true },
        });
        return api.confirmarUpload(...a);
      },
    };
    let urlAssinada = "";
    d.transporte = (req) => ((urlAssinada = req.url), armazenamento.receberEnvioMock(req));
    const r = await envio.enviarMidia(
      { produtoId: produto.id, arquivo: jpg(), kind: "image", principal: true },
      d,
    );
    expect(r.estado).toBe("confirmado");
    expect(noMomentoDoPost).toEqual([
      `${registro.PREFIXO_CONFIRMACOES_WEB}${(r as { uploadId: string }).uploadId}`,
    ]);
    expect(pc.storage.length).toBe(0); // confirmado → registro removido

    // Pendente: confere o conteúdo gravado.
    const { uploadId } = await deixarPendente(pc, "confirmacao-rede");
    const bruto = pc.storage.getItem(registro.PREFIXO_CONFIRMACOES_WEB + uploadId)!;
    expect(Object.keys(JSON.parse(bruto)).sort()).toEqual(
      ["confirmacao", "criadoEm", "estado", "kind", "produtoId", "uploadId", "versao"].sort(),
    );
    expect(JSON.parse(bruto)).toMatchObject({
      versao: 1,
      produtoId: produto.id,
      uploadId,
      kind: "image",
      estado: "pendente",
      confirmacao: { principal: true },
    });
    for (const proibido of [
      urlAssinada,
      "mock-r2",
      "Bearer",
      "eyJ",
      "token",
      "uploadUrl",
      "Cache-Control",
      "X-Amz",
    ]) {
      expect(bruto).not.toContain(proibido);
    }
  });

  test("10. falha de persistência: a confirmação NÃO é enviada; nova tentativa usa o MESMO uploadId sem novo envio", async () => {
    const pc = new Computador();
    const chamadas: string[] = [];
    let puts = 0;
    const d = abrirApp(pc, chamadas, {
      transporte: (req) => ((puts += 1), armazenamento.receberEnvioMock(req)),
    });
    pc.falharGravacao = true;
    const r = await envio.enviarMidia({ produtoId: produto.id, arquivo: jpg(), kind: "image" }, d);
    expect(r.estado).toBe("confirmacao_nao_enviada");
    if (r.estado !== "confirmacao_nao_enviada") throw new Error();
    expect(r.falha).toMatchObject({ tipo: "persistencia_indisponivel", etapa: "confirmacao" });
    expect(r.falha.mensagem).toContain("NÃO foi enviada");
    expect(chamadas).toEqual(["POST solicitar"]); // nenhum POST de confirmação
    expect(
      (await mock<{ midias: unknown[] }>("GET", `/produtos/${produto.id}/midias`)).midias,
    ).toEqual([]);

    pc.falharGravacao = false;
    const retomada = await envio.retomarConfirmacao(r.retomar, d);
    expect(retomada.estado).toBe("confirmado");
    if (retomada.estado !== "confirmado") throw new Error();
    expect(retomada.uploadId).toBe(r.uploadId);
    expect(puts).toBe(1);
    expect(chamadas).toEqual(["POST solicitar", "POST confirmar {}"]);
  });

  test("10b. sem conseguir LER o armazenamento, nenhum envio começa", async () => {
    const chamadas: string[] = [];
    const d = abrirApp(new Computador(), chamadas, {
      pendencias: new envio.RegistroEnviosPendentes(
        registro.criarArmazenamentoConfirmacoesSobreStorage(() => null),
      ),
    });
    const r = await envio.enviarMidia({ produtoId: produto.id, arquivo: jpg(), kind: "image" }, d);
    expect(r).toMatchObject({ estado: "falhou", falha: { tipo: "persistencia_indisponivel" } });
    expect(chamadas).toEqual([]);
  });
});

describe("recuperação depois de fechar e reabrir o app", () => {
  test("3–7. mídia JÁ confirmada e resposta perdida: na reabertura, só GET da galeria; o registro é removido; nenhum POST", async () => {
    const pc = new Computador();
    const { uploadId } = await deixarPendente(pc, "confirmacao-gravar-e-503");
    const chamadas: string[] = [];
    const reaberto = abrirApp(pc, chamadas); // "fechar e reabrir": repositório novo, mesmo meio
    expect((await reaberto.pendencias.listarTodas())!.pendentes.map((p) => p.uploadId)).toEqual([
      uploadId,
    ]);
    const situacoes = await envio.verificarPendencias(reaberto);
    expect(situacoes).toEqual([{ uploadId, produtoId: produto.id, situacao: "confirmada" }]);
    expect(chamadas).toEqual(["GET galeria"]);
    expect(pc.storage.length).toBe(0);
  });

  test("4–6, 8. mídia AUSENTE: a verificação só lê; repetir é ação explícita, com o MESMO uploadId e o MESMO corpo", async () => {
    const pc = new Computador();
    const { uploadId } = await deixarPendente(pc, "confirmacao-rede");
    const chamadas: string[] = [];
    const reaberto = abrirApp(pc, chamadas);
    const [situacao] = (await envio.verificarPendencias(reaberto))!;
    expect(situacao).toMatchObject({ uploadId, situacao: "aguardando_confirmacao" });
    expect(chamadas).toEqual(["GET galeria"]); // nenhum POST automático
    expect(pc.storage.length).toBe(1);

    const r = await envio.reconciliarEnvio(produto.id, uploadId, reaberto);
    expect(r.estado).toBe("confirmado");
    expect(chamadas).toEqual(["GET galeria", "GET galeria", 'POST confirmar {"principal":true}']);
    expect(pc.storage.length).toBe(0);
    // A galeria consultada ANTES da repetição.
    expect(chamadas.indexOf("GET galeria")).toBeLessThan(
      chamadas.findIndex((c) => c.startsWith("POST confirmar")),
    );
  });

  test("9. falha de rede ao consultar a galeria: pendência mantida, informada como não verificada", async () => {
    const pc = new Computador();
    const { uploadId } = await deixarPendente(pc, "confirmacao-rede");
    const chamadas: string[] = [];
    const reaberto = abrirApp(pc, chamadas);
    reaberto.api = {
      ...reaberto.api,
      listar: async () =>
        Promise.reject(new ApiError({ statusCode: 0, code: "NETWORK_ERROR", message: "x" })),
    };
    const [s] = (await envio.verificarPendencias(reaberto))!;
    expect(s).toMatchObject({ uploadId, situacao: "nao_verificada", falha: { tipo: "rede" } });
    const r = await envio.reconciliarEnvio(produto.id, uploadId, reaberto);
    expect(r).toMatchObject({
      estado: "confirmacao_pendente",
      falha: { tipo: "rede", incerta: true },
    });
    expect(pc.storage.length).toBe(1);
  });

  test("resposta inconclusiva na repetição: registro mantido (estado 'pendente')", async () => {
    const pc = new Computador();
    const { uploadId } = await deixarPendente(pc, "confirmacao-rede");
    armazenamento.simularFalhasDeMidia(["confirmacao-503"]);
    const r = await envio.reconciliarEnvio(produto.id, uploadId, abrirApp(pc, []));
    expect(r.estado).toBe("confirmacao_pendente");
    expect(
      JSON.parse(pc.storage.getItem(registro.PREFIXO_CONFIRMACOES_WEB + uploadId)!).estado,
    ).toBe("pendente");
  });

  test("recusa definitiva na repetição: registro removido (nunca fica preso)", async () => {
    const pc = new Computador();
    const { uploadId } = await deixarPendente(pc, "confirmacao-rede");
    armazenamento.reiniciarArmazenamentoMock(); // o objeto "sumiu" do armazenamento → 400 na confirmação
    const r = await envio.reconciliarEnvio(produto.id, uploadId, abrirApp(pc, []));
    expect(r).toMatchObject({ estado: "falhou", falha: { tipo: "arquivo_invalido" } });
    expect(pc.storage.length).toBe(0);
  });
});

describe("integridade", () => {
  test("11 e 12. registro corrompido: listado à parte, nunca reaproveitado; os demais seguem intactos e recuperáveis", async () => {
    const pc = new Computador();
    const a = await deixarPendente(pc, "confirmacao-rede", produto, 1);
    const b = await deixarPendente(pc, "confirmacao-rede", outro, 2);
    pc.storage.setItem(`${registro.PREFIXO_CONFIRMACOES_WEB}upl_corrompido`, "{lixo");
    const d = abrirApp(pc, []);
    const todas = (await d.pendencias.listarTodas())!;
    expect(todas.corrompidos).toEqual(["upl_corrompido"]);
    expect(todas.pendentes.map((p) => p.uploadId).sort()).toEqual([a.uploadId, b.uploadId].sort());
    const situacoes = (await envio.verificarPendencias(d))!;
    expect(situacoes.find((s) => s.situacao === "corrompida")?.uploadId).toBe("upl_corrompido");
    // Reconciliar A não toca B nem o corrompido.
    expect((await envio.reconciliarEnvio(produto.id, a.uploadId, d)).estado).toBe("confirmado");
    expect(pc.storage.getItem(`${registro.PREFIXO_CONFIRMACOES_WEB}upl_corrompido`)).toBe("{lixo");
    expect(pc.storage.getItem(registro.PREFIXO_CONFIRMACOES_WEB + b.uploadId)).not.toBeNull();
    // Gravar por cima do corrompido é conflito; só o descarte explícito o remove.
    expect(
      await d.pendencias.registrar({
        produtoId: produto.id,
        uploadId: "upl_corrompido",
        kind: "image",
        confirmacao: {},
        estado: "confirmando",
        criadoEm: "2026-11-19T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(await envio.descartarPendencia("upl_corrompido", d)).toBe(true);
    expect(pc.storage.getItem(`${registro.PREFIXO_CONFIRMACOES_WEB}upl_corrompido`)).toBeNull();
  });

  test("pendência bloqueia novo envio SÓ do mesmo produto; outro produto segue", async () => {
    const pc = new Computador();
    await deixarPendente(pc, "confirmacao-rede", produto);
    const d = abrirApp(pc, []);
    expect(
      await envio.enviarMidia({ produtoId: produto.id, arquivo: jpg(2), kind: "image" }, d),
    ).toMatchObject({
      estado: "falhou",
      falha: { tipo: "reconciliacao_pendente" },
    });
    expect(
      (await envio.enviarMidia({ produtoId: outro.id, arquivo: jpg(3), kind: "image" }, d)).estado,
    ).toBe("confirmado");
  });

  test("outra operação nunca sobrescreve o registro de um uploadId", async () => {
    const pc = new Computador();
    const { uploadId } = await deixarPendente(pc, "confirmacao-rede");
    const d = abrirApp(pc, []);
    const [atual] = (await d.pendencias.listar(produto.id))!;
    expect(await d.pendencias.registrar({ ...atual!, confirmacao: { principal: false } })).toBe(
      false,
    );
    expect(await d.pendencias.registrar({ ...atual!, produtoId: outro.id })).toBe(false);
    expect(await d.pendencias.registrar({ ...atual!, estado: "confirmando" })).toBe(true); // só o estado muda
    expect(
      JSON.parse(pc.storage.getItem(registro.PREFIXO_CONFIRMACOES_WEB + uploadId)!).confirmacao,
    ).toEqual({ principal: true });
  });
});

describe("sessão", () => {
  test("13. logout não apaga a pendência; sem sessão, a verificação não consulta nada", async () => {
    const pc = new Computador();
    await deixarPendente(pc, "confirmacao-rede");
    sessaoAtiva = false; // logout: o token sai; o armazenamento de confirmações não é tocado
    const chamadas: string[] = [];
    expect(await envio.verificarPendencias(abrirApp(pc, chamadas))).toBeNull();
    expect(chamadas).toEqual([]);
    expect(pc.storage.length).toBe(1);
  });

  test("14. sessão encerrada: a confirmação não é enviada (registro mantido para depois do login)", async () => {
    const pc = new Computador();
    const chamadas: string[] = [];
    const d = abrirApp(pc, chamadas);
    const confirmarOriginal = d.api.confirmarUpload;
    // A sessão termina depois do envio do arquivo e antes da confirmação.
    d.transporte = async (req) => {
      const r = await armazenamento.receberEnvioMock(req);
      geracao += 1;
      return r;
    };
    d.api = { ...d.api, confirmarUpload: confirmarOriginal };
    const r = await envio.enviarMidia({ produtoId: produto.id, arquivo: jpg(), kind: "image" }, d);
    expect(r).toMatchObject({ estado: "confirmacao_pendente", falha: { tipo: "sessao" } });
    expect(chamadas).toEqual(["POST solicitar"]);
    expect(pc.storage.length).toBe(1);

    // Reconciliação com a sessão encerrada (sem token): também não envia.
    sessaoAtiva = false;
    const rr = await envio.reconciliarEnvio(
      produto.id,
      (r as { uploadId: string }).uploadId,
      abrirApp(pc, chamadas),
    );
    expect(rr).toMatchObject({ estado: "confirmacao_pendente", falha: { tipo: "sessao" } });
    expect(chamadas.filter((c) => c.startsWith("POST confirmar"))).toEqual([]);
  });
});

describe("armazenamento nativo e isolamento", () => {
  test("15. meios diferentes (identidade oficial × isolada) nunca enxergam os registros um do outro", async () => {
    const oficial = new Computador();
    const isolado = new Computador();
    await deixarPendente(isolado, "confirmacao-rede");
    expect((await abrirApp(oficial, []).pendencias.listarTodas())!.pendentes).toEqual([]);
    expect((await abrirApp(isolado, []).pendencias.listarTodas())!.pendentes).toHaveLength(1);
  });

  test("transporte nativo usa SÓ os comandos midia_confirmacao_* (nunca os de cancelamento ou sessão) e mapeia erros", async () => {
    const chamados: string[] = [];
    const arquivos = new Map<string, string>();
    const nativo = registro.criarArmazenamentoConfirmacoesNativo(async (cmd, args) => {
      chamados.push(cmd);
      if (cmd === "midia_confirmacao_listar")
        return [...arquivos].map(([uploadId, conteudo]) => ({ uploadId, conteudo }));
      if (cmd === "midia_confirmacao_gravar") {
        if (
          arquivos.has(String(args?.["uploadId"])) &&
          String(args?.["conteudo"]).includes('"principal":false')
        )
          throw "CONFLITO";
        arquivos.set(String(args?.["uploadId"]), String(args?.["conteudo"]));
        return null;
      }
      if (cmd === "midia_confirmacao_remover")
        return void arquivos.delete(String(args?.["uploadId"]));
      throw new Error("desconhecido");
    });
    const repo = new envio.RegistroEnviosPendentes(nativo);
    const p = {
      produtoId: "p1",
      uploadId: "u1",
      kind: "image" as const,
      confirmacao: { principal: true },
      estado: "confirmando" as const,
      criadoEm: "2026-11-19T00:00:00.000Z",
    };
    expect(await repo.registrar(p)).toBe(true);
    expect(await repo.registrar({ ...p, confirmacao: { principal: false } })).toBe(false);
    expect((await repo.listar("p1"))!.map((x) => x.uploadId)).toEqual(["u1"]);
    expect(await repo.remover("u1")).toBe(true);
    expect(new Set(chamados)).toEqual(
      new Set([
        "midia_confirmacao_gravar",
        "midia_confirmacao_listar",
        "midia_confirmacao_remover",
      ]),
    );
    const quebrado = registro.criarArmazenamentoConfirmacoesNativo(async () =>
      Promise.reject(new Error("not allowed")),
    );
    expect(await quebrado.listar()).toEqual({ ok: false, codigo: "FALHA_DE_INVOCACAO" });
    expect(await new envio.RegistroEnviosPendentes(quebrado).listarTodas()).toBeNull();
  });

  test("formato: campos extras (URL, token) e corpo de confirmação com campos desconhecidos são recusados", () => {
    const base = {
      versao: 1,
      produtoId: "p1",
      uploadId: "u1",
      kind: "image",
      confirmacao: {},
      estado: "confirmando",
      criadoEm: "2026-11-19T00:00:00.000Z",
    };
    expect(registro.lerRegistroConfirmacao("u1", JSON.stringify(base))).not.toBeNull();
    for (const ruim of [
      { ...base, uploadUrl: "https://x/y?X-Amz-Signature=z" },
      { ...base, confirmacao: { authorization: "Bearer eyJ.a.b" } },
      { ...base, uploadId: "u2" },
      { ...base, estado: "confirmado" },
      { ...base, versao: 2 },
    ]) {
      expect(registro.lerRegistroConfirmacao("u1", JSON.stringify(ruim))).toBeNull();
    }
    expect(confirmar({ uploadId: "x" })).toEqual({ uploadId: "x" });
  });
});
