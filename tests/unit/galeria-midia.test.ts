/**
 * Fase 22.8.9.9.2 (M2) — integração da API de mídia (galeria do produto), sem interface.
 * Executar com: `bun test tests/unit`
 *
 * - Fluxo completo (`envio-midia.ts`) contra a Mock API da galeria (`galeria.mock.ts`) e o armazenamento SIMULADO
 *   (`armazenamento-midia.mock.ts`) — mesmas regras do backend no commit M1. Nenhuma rede, nenhum R2.
 * - `galeriaApi` e o `Retry-After` pelo `apiClient` real, com `fetch` falso.
 * - Transporte `XMLHttpRequest` com um XHR falso (cabeçalhos exatos).
 * Dados sintéticos.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

process.env.VITE_USE_MOCK_API = "false";
process.env.VITE_API_URL = "http://api.ficticia.invalid/api/v1";

const { ApiError } = await import("@/types/api");
const { handleMockRequest } = await import("@/services/mock/mock-transport");
const { db } = await import("@/services/mock/db");
const armazenamento = await import("@/services/mock/armazenamento-midia.mock");
const { reiniciarGaleriaMock } = await import("@/services/mock/galeria.mock");
const envio = await import("@/services/midia/envio-midia");
const { galeriaApi } = await import("@/services/api/galeria.api");
const { lerRetryAfter } = await import("@/services/api/client");
const { salvarSessao, limparSessao } = await import("@/services/auth/token-storage");
const { galeriaEfetiva } = await import("@/utils/galeria");
type ApiGaleriaEnvio = import("@/services/midia/envio-midia").ApiGaleriaEnvio;
type DependenciasEnvio = import("@/services/midia/envio-midia").DependenciasEnvio;
type Produto = import("@/types/produto").Produto;
type HttpMethod = import("@/services/api/client").HttpMethod;

// ─── Infraestrutura dos testes ─────────────────────────────────────────────────────────────────────────────────────

const MIB = 1024 * 1024;

async function mock<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const r = await handleMockRequest<T>({ method, path, params: {}, body, token: "token-ficticio" });
  return r.data;
}

/** A API da galeria servida pela Mock API (mesmas rotas de `galeriaApi`). */
function apiMock(registro: string[] = []): ApiGaleriaEnvio {
  return {
    solicitarUpload: (id, p) => (
      registro.push("solicitar"),
      mock("POST", `/produtos/${id}/midias/uploads`, p)
    ),
    confirmarUpload: (id, u, p = {}) => (
      registro.push("confirmar"),
      mock("POST", `/produtos/${id}/midias/uploads/${u}/confirmacao`, p)
    ),
    listar: (id) => (registro.push("listar"), mock("GET", `/produtos/${id}/midias`)),
  };
}

let relogio = 1_800_000_000_000;
function deps(
  extra: Partial<DependenciasEnvio> & { chamadas?: string[]; puts?: unknown[] } = {},
): DependenciasEnvio {
  const puts = extra.puts ?? [];
  return {
    api: extra.api ?? apiMock(extra.chamadas),
    transporte:
      extra.transporte ??
      (async (req) => {
        puts.push({ method: req.method, headers: { ...req.headers }, tamanho: req.corpo.size });
        return armazenamento.receberEnvioMock(req);
      }),
    pendencias: extra.pendencias ?? new envio.RegistroEnviosPendentes(),
    // Fase 22.8.9.9.3 — sessão ADMIN ativa (os testes de sessão encerrada ficam em `confirmacoes-midia.test.ts`).
    sessao: extra.sessao ?? { geracao: () => 1, ativa: () => true },
    agora: extra.agora ?? (() => relogio),
  };
}

const arquivo = (nome: string, tipo: string, tamanho = 1024) =>
  new File([new Uint8Array(tamanho)], nome, { type: tipo });
const jpg = (n = 1, tamanho = 1024) => arquivo(`foto-${n}.jpg`, "image/jpeg", tamanho);
const mp4 = (tamanho = 2048) => arquivo("video.mp4", "video/mp4", tamanho);

let produto: Produto;
beforeEach(() => {
  relogio = 1_800_000_000_000;
  armazenamento.reiniciarArmazenamentoMock();
  armazenamento.definirRelogioMidiaMock(() => relogio);
  reiniciarGaleriaMock();
  produto = db.produtos[0]!;
  produto.midias = [];
  produto.midiaPrincipalId = null;
});
afterAll(() => {
  armazenamento.definirRelogioMidiaMock(null);
  limparSessao();
});

async function enviarImagem(
  d: DependenciasEnvio,
  n = 1,
  extra: Partial<import("@/services/midia/envio-midia").ParametrosEnvio> = {},
) {
  return envio.enviarMidia({ produtoId: produto.id, arquivo: jpg(n), kind: "image", ...extra }, d);
}

// ─── Fluxo ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("solicitação, envio direto e confirmação", () => {
  test("1. imagem: solicita, envia e confirma; só a confirmação conclui", async () => {
    const chamadas: string[] = [];
    const r = await enviarImagem(deps({ chamadas }));
    expect(r.estado).toBe("confirmado");
    if (r.estado !== "confirmado") throw new Error();
    expect(chamadas).toEqual(["solicitar", "confirmar"]);
    expect(r.midia).toMatchObject({
      id: r.uploadId,
      tipo: "image",
      origem: "upload",
      contentType: "image/jpeg",
      tamanho: 1024,
    });
    expect(r.galeria.midias.map((m) => m.id)).toEqual([r.uploadId]);
    expect(r.galeria.midiaPrincipalId).toBe(r.uploadId);
  });

  test("2. vídeo: solicita, envia e confirma (sem principal e sem variante)", async () => {
    const r = await envio.enviarMidia(
      { produtoId: produto.id, arquivo: mp4(), kind: "video" },
      deps(),
    );
    expect(r.estado).toBe("confirmado");
    if (r.estado !== "confirmado") throw new Error();
    expect(r.midia).toMatchObject({ tipo: "video", contentType: "video/mp4", varianteId: null });
    expect(r.galeria.midiaPrincipalId).toBeNull();
  });

  test("3. o PUT usa EXATAMENTE método e cabeçalhos devolvidos; o arquivo nunca vai ao backend", async () => {
    const puts: { method: string; headers: Record<string, string>; tamanho: number }[] = [];
    const corpos: unknown[] = [];
    const api = apiMock();
    const espiada: ApiGaleriaEnvio = {
      ...api,
      solicitarUpload: (id, p) => (corpos.push(p), api.solicitarUpload(id, p)),
    };
    const r = await enviarImagem(deps({ api: espiada, puts }));
    expect(r.estado).toBe("confirmado");
    expect(puts).toEqual([
      {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
        tamanho: 1024,
      },
    ]);
    // A solicitação é só JSON: nome, tipo, kind e tamanho — nenhum binário.
    expect(corpos).toEqual([
      { fileName: "foto-1.jpg", contentType: "image/jpeg", kind: "image", size: 1024 },
    ]);
  });

  test("3b. transporte XHR: só os cabeçalhos recebidos, mesmo método/URL, corpo intacto, sem credenciais", async () => {
    const registro: { aberto?: [string, string]; cabecalhos: [string, string][]; corpo?: Blob } = {
      cabecalhos: [],
    };
    class XhrFalso {
      timeout = 0;
      status = 200;
      upload = { onprogress: null as ((e: { loaded: number; total: number }) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open(m: string, u: string) {
        registro.aberto = [m, u];
      }
      setRequestHeader(n: string, v: string) {
        registro.cabecalhos.push([n, v]);
      }
      send(corpo: Blob) {
        registro.corpo = corpo;
        this.upload.onprogress?.({ loaded: corpo.size, total: corpo.size });
        this.onload?.();
      }
    }
    const progresso: number[] = [];
    const corpo = jpg();
    const r = await envio.transporteXhr(() => new XhrFalso())({
      url: "https://conta.r2.cloudflarestorage.invalid/bucket/chave?X-Amz-Signature=ficticia",
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      corpo,
      prazoMs: 60_000,
      onProgresso: (e) => progresso.push(e),
    });
    expect(r).toEqual({ status: 200 });
    expect(registro.aberto).toEqual([
      "PUT",
      "https://conta.r2.cloudflarestorage.invalid/bucket/chave?X-Amz-Signature=ficticia",
    ]);
    expect(registro.cabecalhos).toEqual([
      ["Content-Type", "image/jpeg"],
      ["Cache-Control", "public, max-age=31536000, immutable"],
    ]);
    expect(registro.corpo).toBe(corpo);
    expect(progresso).toEqual([1024]);
  });

  test("3c. armazenamento simulado recusa cabeçalho a mais, a menos ou alterado (como a assinatura do R2)", async () => {
    for (const mexer of [
      (h: Record<string, string>) => ({ ...h, Authorization: "Bearer x" }),
      (h: Record<string, string>) => ({ "Content-Type": h["Content-Type"]! }),
      (h: Record<string, string>) => ({ ...h, "Content-Type": "text/html" }),
    ]) {
      armazenamento.reiniciarArmazenamentoMock();
      const r = await enviarImagem(
        deps({
          transporte: (req) =>
            armazenamento.receberEnvioMock({ ...req, headers: mexer(req.headers) }),
        }),
      );
      expect(r.estado).toBe("falhou");
      if (r.estado !== "falhou") throw new Error();
      expect(r.falha).toMatchObject({ tipo: "armazenamento_recusou", etapa: "envio" });
    }
  });

  test("4. confirmação idempotente: repetir com o mesmo uploadId não duplica", async () => {
    const r = await enviarImagem(deps());
    if (r.estado !== "confirmado") throw new Error();
    const repetida = await apiMock().confirmarUpload(produto.id, r.uploadId);
    expect(repetida.midias.map((m) => m.id)).toEqual([r.uploadId]);
  });
});

describe("falhas", () => {
  test("5. falha no PUT: nada é confirmado (nenhuma chamada de confirmação) e a galeria fica intacta", async () => {
    for (const falha of ["envio-rede", "envio-503"] as const) {
      const chamadas: string[] = [];
      armazenamento.simularFalhasDeMidia([falha]);
      const r = await enviarImagem(deps({ chamadas }));
      expect(r.estado).toBe("falhou");
      if (r.estado !== "falhou") throw new Error();
      expect(r.falha.etapa).toBe("envio");
      expect(r.falha.tipo).toBe(falha === "envio-rede" ? "rede" : "indisponivel");
      expect(chamadas).toEqual(["solicitar"]);
    }
    expect((await apiMock().listar(produto.id)).midias).toEqual([]);
  });

  test("6. URL assinada vencida: o PUT não é feito (nem repetido); recusa 403 após o prazo vira 'url_expirada'", async () => {
    let puts = 0;
    const atrasada = await enviarImagem(
      deps({
        api: {
          ...apiMock(),
          solicitarUpload: async (id, p) => ({
            ...(await apiMock().solicitarUpload(id, p)),
            expiresIn: 5,
          }),
        },
        transporte: async () => ((puts += 1), { status: 200 }),
      }),
    );
    expect(atrasada.estado).toBe("falhou");
    if (atrasada.estado !== "falhou") throw new Error();
    expect(atrasada.falha).toMatchObject({ tipo: "url_expirada", etapa: "envio" });
    expect(puts).toBe(0);

    // A URL vence DURANTE o envio: o armazenamento responde 403; não há nova tentativa.
    let tentativas = 0;
    const vencida = await enviarImagem(
      deps({
        transporte: async (req) => {
          tentativas += 1;
          relogio += 601_000;
          return armazenamento.receberEnvioMock(req);
        },
      }),
    );
    expect(vencida.estado).toBe("falhou");
    if (vencida.estado !== "falhou") throw new Error();
    expect(vencida.falha.tipo).toBe("url_expirada");
    expect(tentativas).toBe(1);
  });

  test("7. 409 na solicitação: classificado como conflito, sem PUT", async () => {
    let puts = 0;
    armazenamento.simularFalhasDeMidia(["solicitacao-409"]);
    const r = await enviarImagem(deps({ transporte: async () => ((puts += 1), { status: 200 }) }));
    expect(r.estado).toBe("falhou");
    if (r.estado !== "falhou") throw new Error();
    expect(r.falha).toMatchObject({ tipo: "conflito", etapa: "solicitacao", incerta: false });
    expect(puts).toBe(0);
  });

  test("8. 429: classificado com o Retry-After; sem o cabeçalho legível, usa a janela de 60 s", async () => {
    armazenamento.simularFalhasDeMidia(["solicitacao-429"]);
    const chamadas429: string[] = [];
    const r = await enviarImagem(deps({ chamadas: chamadas429 }));
    if (r.estado !== "falhou") throw new Error();
    expect(r.falha).toMatchObject({ tipo: "limite_requisicoes", retryAfterSegundos: 42 });
    // Fase 22.8.9.9.3 (22) — nenhuma repetição automática durante a espera: uma única solicitação, nada depois.
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(chamadas429).toEqual(["solicitar"]);
    const semCabecalho = envio.classificarErroMidia(
      new ApiError({ statusCode: 429, code: "TOO_MANY_REQUESTS", message: "x" }),
      "solicitacao",
    );
    expect(semCabecalho.retryAfterSegundos).toBe(60);
    expect(lerRetryAfter("30")).toBe(30);
    expect(lerRetryAfter("0")).toBe(1);
    expect(
      lerRetryAfter("Wed, 21 Oct 2026 07:28:30 GMT", Date.parse("Wed, 21 Oct 2026 07:28:00 GMT")),
    ).toBe(30);
    expect(lerRetryAfter(null)).toBeNull();
    expect(lerRetryAfter("amanhã")).toBeNull();
  });

  test("9 e 10. rede, tempo esgotado e 503 na solicitação: falha temporária, nunca sucesso", async () => {
    const casos = [
      [new ApiError({ statusCode: 0, code: "NETWORK_ERROR", message: "x" }), "rede"],
      [new ApiError({ statusCode: 408, code: "TIMEOUT", message: "x" }), "indisponivel"],
      [
        new ApiError({ statusCode: 503, code: "STORAGE_UNAVAILABLE", message: "x" }),
        "indisponivel",
      ],
      [
        new ApiError({ statusCode: 503, code: "STORAGE_NOT_CONFIGURED", message: "x" }),
        "nao_configurado",
      ],
    ] as const;
    for (const [erro, tipo] of casos) {
      const r = await enviarImagem(
        deps({ api: { ...apiMock(), solicitarUpload: async () => Promise.reject(erro) } }),
      );
      expect(r.estado).toBe("falhou");
      if (r.estado !== "falhou") throw new Error();
      expect(r.falha).toMatchObject({ tipo, etapa: "solicitacao", incerta: false });
    }
  });

  test("11. confirmação incerta (gravou e a resposta se perdeu): fica pendente; a reconciliação lê a galeria e conclui sem novo envio", async () => {
    const chamadas: string[] = [];
    const d = deps({ chamadas });
    armazenamento.simularFalhasDeMidia(["confirmacao-gravar-e-503"]);
    const r = await enviarImagem(d);
    expect(r.estado).toBe("confirmacao_pendente");
    if (r.estado !== "confirmacao_pendente") throw new Error();
    expect(r.falha).toMatchObject({ tipo: "indisponivel", etapa: "confirmacao", incerta: true });
    expect((await d.pendencias.listar(produto.id))!.map((p) => p.uploadId)).toEqual([r.uploadId]);

    // Antes de reconciliar, nenhum novo envio para o produto.
    const bloqueado = await enviarImagem(d, 2);
    expect(bloqueado.estado).toBe("falhou");
    if (bloqueado.estado !== "falhou") throw new Error();
    expect(bloqueado.falha.tipo).toBe("reconciliacao_pendente");

    const conciliado = await envio.reconciliarEnvio(produto.id, r.uploadId, d);
    expect(conciliado.estado).toBe("confirmado");
    expect(chamadas).toEqual(["solicitar", "confirmar", "listar"]);
    expect(await d.pendencias.listar(produto.id)).toEqual([]);
  });

  test("11b. confirmação sem resposta e NÃO gravada: a reconciliação repete a confirmação com o MESMO uploadId", async () => {
    const chamadas: string[] = [];
    const d = deps({ chamadas });
    armazenamento.simularFalhasDeMidia(["confirmacao-rede"]);
    const r = await enviarImagem(d);
    expect(r.estado).toBe("confirmacao_pendente");
    if (r.estado !== "confirmacao_pendente") throw new Error();
    expect(r.falha).toMatchObject({ tipo: "rede", incerta: true });
    const conciliado = await envio.reconciliarEnvio(produto.id, r.uploadId, d);
    expect(conciliado.estado).toBe("confirmado");
    if (conciliado.estado !== "confirmado") throw new Error();
    expect(conciliado.uploadId).toBe(r.uploadId);
    expect(chamadas).toEqual(["solicitar", "confirmar", "listar", "confirmar"]);
    expect(conciliado.galeria.midias).toHaveLength(1);
  });

  test("11c. 429 na confirmação: pendente (mesmo uploadId), sem reenvio do arquivo", async () => {
    let puts = 0;
    const d = deps({
      transporte: async (req) => ((puts += 1), armazenamento.receberEnvioMock(req)),
    });
    armazenamento.simularFalhasDeMidia(["confirmacao-429"]);
    const r = await enviarImagem(d);
    expect(r.estado).toBe("confirmacao_pendente");
    if (r.estado !== "confirmacao_pendente") throw new Error();
    expect(r.falha).toMatchObject({ tipo: "limite_requisicoes", retryAfterSegundos: 42 });
    // (22) A confirmação recusada por 429 NÃO é repetida sozinha: só a reconciliação explícita a repete.
    expect((await d.pendencias.listar(produto.id))!.map((x) => x.estado)).toEqual(["pendente"]);
    expect((await envio.reconciliarEnvio(produto.id, r.uploadId, d)).estado).toBe("confirmado");
    expect(puts).toBe(1);
  });

  test("12. sem envio duplicado: um segundo envio simultâneo do mesmo produto é recusado sem requisição", async () => {
    const chamadas: string[] = [];
    const d = deps({ chamadas });
    const [a, b] = await Promise.all([enviarImagem(d, 1), enviarImagem(d, 2)]);
    expect(a.estado).toBe("confirmado");
    expect(b.estado).toBe("falhou");
    if (b.estado !== "falhou") throw new Error();
    expect(b.falha.tipo).toBe("envio_em_andamento");
    expect(chamadas).toEqual(["solicitar", "confirmar"]);
  });

  test("validação local: tipo, extensão, vazio e tamanho recusados antes de qualquer requisição (GIF não é oferecido)", async () => {
    const chamadas: string[] = [];
    const casos = [
      [arquivo("a.gif", "image/gif"), "image", "arquivo_invalido"],
      [arquivo("a.png", "image/jpeg"), "image", "arquivo_invalido"],
      [arquivo("a.jpg", "image/jpeg", 0), "image", "arquivo_invalido"],
      [jpg(1, 5 * MIB + 1), "image", "muito_grande"],
      [arquivo("v.webm", "video/webm"), "video", "arquivo_invalido"],
      [mp4(15 * MIB + 1), "video", "muito_grande"],
    ] as const;
    for (const [arq, kind, tipo] of casos) {
      const r = await envio.enviarMidia(
        { produtoId: produto.id, arquivo: arq, kind },
        deps({ chamadas }),
      );
      if (r.estado !== "falhou") throw new Error();
      expect(r.falha).toMatchObject({ tipo, etapa: "validacao" });
    }
    expect(chamadas).toEqual([]);
  });
});

// ─── Galeria ───────────────────────────────────────────────────────────────────────────────────────────────────────

describe("galeria", () => {
  test("13. galeria vazia", async () => {
    expect(await apiMock().listar(produto.id)).toEqual({ midias: [], midiaPrincipalId: null });
    expect(
      galeriaEfetiva({
        ...produto,
        variantes: produto.variantes.map((v) => ({ ...v, foto: null, video: null })),
      }),
    ).toEqual({
      fonte: "vazia",
      imagens: [],
      video: null,
    });
  });

  test("14. produto só com URLs antigas: valem os campos legados; com imagem na galeria, a galeria manda", () => {
    const [v1, v2] = [produto.variantes[0]!, produto.variantes[1] ?? produto.variantes[0]!];
    const legado: Produto = {
      ...produto,
      midias: undefined as never,
      fotoPrincipalVarianteId: v2.id,
      variantes: produto.variantes.map((v) => ({
        ...v,
        foto: `https://fotos.exemplo.invalid/${v.id}.jpg`,
        video: v.id === v1.id ? "https://videos.exemplo.invalid/v.mp4" : null,
      })),
    };
    delete (legado as Partial<Produto>).midias;
    const e = galeriaEfetiva(legado);
    expect(e.fonte).toBe("legado");
    expect(e.imagens[0]).toMatchObject({
      id: `legado:${v2.id}`,
      principal: true,
      origem: "legado",
    });
    expect(e.video).toMatchObject({
      origem: "legado",
      url: "https://videos.exemplo.invalid/v.mp4",
    });

    const comGaleria: Produto = {
      ...legado,
      midias: [
        {
          id: "m1",
          tipo: "image",
          chave: "k1",
          url: "https://midia.invalid/k1",
          contentType: "image/jpeg",
          tamanho: 1,
          nomeOriginal: "a.jpg",
          origem: "upload",
          varianteId: null,
          ordem: 1,
          criadoEm: "2026-11-19T00:00:00.000Z",
          criadoPor: null,
        },
        {
          id: "m0",
          tipo: "image",
          chave: "k0",
          url: "https://midia.invalid/k0",
          contentType: "image/jpeg",
          tamanho: 1,
          nomeOriginal: "b.jpg",
          origem: "upload",
          varianteId: null,
          ordem: 0,
          criadoEm: "2026-11-19T00:00:00.000Z",
          criadoPor: null,
        },
      ],
      midiaPrincipalId: null,
    };
    const g = galeriaEfetiva(comGaleria);
    expect(g.fonte).toBe("galeria");
    expect(g.imagens.map((i) => i.id)).toEqual(["m0", "m1"]); // sem marcada: a primeira pela ordem
    expect(g.video?.origem).toBe("legado"); // galeria sem vídeo: vídeo legado preservado
  });

  test("15. limite de 10 imagens (envios pendentes contam vaga por 10 min)", async () => {
    const d = deps();
    for (let n = 1; n <= 10; n += 1) expect((await enviarImagem(d, n)).estado).toBe("confirmado");
    const decima1 = await enviarImagem(d, 11);
    if (decima1.estado !== "falhou") throw new Error();
    expect(decima1.falha).toMatchObject({ tipo: "conflito", etapa: "solicitacao" });
    expect(decima1.falha.mensagem).toContain("Limite de 10 imagens");

    // Reserva: com 9 imagens, um envio solicitado e não confirmado ocupa a última vaga.
    produto.midias = produto.midias!.slice(0, 9);
    await apiMock().solicitarUpload(produto.id, {
      fileName: "r.jpg",
      contentType: "image/jpeg",
      kind: "image",
      size: 10,
    });
    const r = await enviarImagem(d, 12);
    if (r.estado !== "falhou") throw new Error();
    expect(r.falha.mensagem).toContain("ainda não confirmado");
    relogio += 601_000; // a URL da reserva venceu: a vaga volta
    expect((await enviarImagem(d, 13)).estado).toBe("confirmado");
  }, 60_000);

  test("16. limite de 1 vídeo", async () => {
    const d = deps();
    expect(
      (await envio.enviarMidia({ produtoId: produto.id, arquivo: mp4(), kind: "video" }, d)).estado,
    ).toBe("confirmado");
    const segundo = await envio.enviarMidia(
      { produtoId: produto.id, arquivo: mp4(), kind: "video" },
      d,
    );
    if (segundo.estado !== "falhou") throw new Error();
    expect(segundo.falha.mensagem).toContain("Limite de 1 vídeo");
  }, 60_000);

  test("17. substituição: mesma vaga, herda ordem e principal; a antiga sai da galeria", async () => {
    const d = deps();
    const a = await enviarImagem(d, 1);
    const b = await enviarImagem(d, 2);
    if (a.estado !== "confirmado" || b.estado !== "confirmado") throw new Error();
    const troca = await enviarImagem(d, 3, { substituiMidiaId: a.uploadId });
    expect(troca.estado).toBe("confirmado");
    if (troca.estado !== "confirmado") throw new Error();
    expect(troca.galeria.midias.map((m) => m.id)).toEqual([troca.uploadId, b.uploadId]);
    expect(troca.galeria.midiaPrincipalId).toBe(troca.uploadId);
    // Vídeo não substitui imagem.
    const errada = await envio.enviarMidia(
      { produtoId: produto.id, arquivo: mp4(), kind: "video", substituiMidiaId: b.uploadId },
      d,
    );
    if (errada.estado !== "falhou") throw new Error();
    expect(errada.falha).toMatchObject({ tipo: "arquivo_invalido", etapa: "solicitacao" });
  }, 60_000);

  test("18. remoção: tira só a mídia; a principal passa à primeira imagem restante; 404 para inexistente", async () => {
    const d = deps();
    const a = await enviarImagem(d, 1);
    const b = await enviarImagem(d, 2);
    if (a.estado !== "confirmado" || b.estado !== "confirmado") throw new Error();
    const g = await mock<{ midias: { id: string }[]; midiaPrincipalId: string | null }>(
      "DELETE",
      `/produtos/${produto.id}/midias/${a.uploadId}`,
    );
    expect(g.midias.map((m) => m.id)).toEqual([b.uploadId]);
    expect(g.midiaPrincipalId).toBe(b.uploadId);
    const nao = await mock("DELETE", `/produtos/${produto.id}/midias/${a.uploadId}`).catch(
      (e: unknown) => e,
    );
    expect(envio.classificarErroMidia(nao, "confirmacao").tipo).toBe("nao_encontrado");
  });

  test("19. principal e ordenação (lista completa; vídeo não pode ser principal)", async () => {
    const d = deps();
    const ids: string[] = [];
    for (let n = 1; n <= 3; n += 1) {
      const r = await enviarImagem(d, n);
      if (r.estado !== "confirmado") throw new Error();
      ids.push(r.uploadId);
    }
    const v = await envio.enviarMidia({ produtoId: produto.id, arquivo: mp4(), kind: "video" }, d);
    if (v.estado !== "confirmado") throw new Error();
    const principal = await mock<{ midiaPrincipalId: string }>(
      "PUT",
      `/produtos/${produto.id}/midias/principal`,
      { midiaId: ids[2] },
    );
    expect(principal.midiaPrincipalId).toBe(ids[2]!);
    const nova = [v.uploadId, ids[2]!, ids[0]!, ids[1]!];
    const ordenada = await mock<{ midias: { id: string }[] }>(
      "PUT",
      `/produtos/${produto.id}/midias/ordem`,
      { midiaIds: nova },
    );
    expect(ordenada.midias.map((m) => m.id)).toEqual(nova);
    const incompleta = await mock("PUT", `/produtos/${produto.id}/midias/ordem`, {
      midiaIds: nova.slice(1),
    }).catch((e: unknown) => e);
    expect(envio.classificarErroMidia(incompleta, "reconciliacao").tipo).toBe("arquivo_invalido");
    const videoPrincipal = await mock("PUT", `/produtos/${produto.id}/midias/principal`, {
      midiaId: v.uploadId,
    }).catch((e: unknown) => e);
    expect((videoPrincipal as InstanceType<typeof ApiError>).statusCode).toBe(400);
  }, 60_000);

  test("20. sem ADMIN: 403 na solicitação é 'sem_permissao' e nada é enviado", async () => {
    let puts = 0;
    armazenamento.simularFalhasDeMidia(["solicitacao-403"]);
    const r = await enviarImagem(deps({ transporte: async () => ((puts += 1), { status: 200 }) }));
    if (r.estado !== "falhou") throw new Error();
    expect(r.falha).toMatchObject({ tipo: "sem_permissao", etapa: "solicitacao" });
    expect(puts).toBe(0);
    expect(
      envio.classificarErroMidia(
        new ApiError({ statusCode: 401, code: "UNAUTHORIZED", message: "x" }),
        "solicitacao",
      ).tipo,
    ).toBe("sessao");
  });
});

// ─── galeriaApi pelo apiClient real (fetch falso) ──────────────────────────────────────────────────────────────────

describe("galeriaApi (apiClient real, fetch falso)", () => {
  test("rotas, métodos e corpos JSON exatos; Retry-After do 429 é lido; 403 vira ApiError 403", async () => {
    salvarSessao({
      accessToken: "eyJ.ficticio.token",
      refreshToken: "refresh_ficticio_0123456789abcdef",
      expiresIn: 900,
    });
    const pedidos: { metodo: string; url: string; corpo: unknown; auth: string | null }[] = [];
    const respostas: Response[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const h = new Headers(init.headers);
      pedidos.push({
        metodo: String(init.method),
        url: String(url),
        corpo: init.body ? JSON.parse(String(init.body)) : null,
        auth: h.get("authorization"),
      });
      return (
        respostas.shift() ??
        new Response(JSON.stringify({ data: { midias: [], midiaPrincipalId: null } }), {
          status: 200,
        })
      );
    }) as typeof fetch;
    try {
      const P = "prod-1";
      await galeriaApi.listar(P);
      await galeriaApi.definirPrincipal(P, "m1");
      await galeriaApi.reordenar(P, ["m2", "m1"]);
      await galeriaApi.associarVariante(P, "m1", null);
      await galeriaApi.remover(P, "m1");
      await galeriaApi.solicitarUpload(P, {
        fileName: "a.jpg",
        contentType: "image/jpeg",
        kind: "image",
        size: 10,
      });
      await galeriaApi.confirmarUpload(P, "upl-1", { principal: true });
      const base = "http://api.ficticia.invalid/api/v1/produtos/prod-1/midias";
      expect(pedidos.map((p) => [p.metodo, p.url, p.corpo])).toEqual([
        ["GET", base, null],
        ["PUT", `${base}/principal`, { midiaId: "m1" }],
        ["PUT", `${base}/ordem`, { midiaIds: ["m2", "m1"] }],
        ["PATCH", `${base}/m1`, { varianteId: null }],
        ["DELETE", `${base}/m1`, null],
        [
          "POST",
          `${base}/uploads`,
          { fileName: "a.jpg", contentType: "image/jpeg", kind: "image", size: 10 },
        ],
        ["POST", `${base}/uploads/upl-1/confirmacao`, { principal: true }],
      ]);
      expect(pedidos.every((p) => p.auth === "Bearer eyJ.ficticio.token")).toBe(true);

      respostas.push(
        new Response(
          JSON.stringify({
            statusCode: 429,
            code: "TOO_MANY_REQUESTS",
            message: "Muitas solicitações.",
          }),
          {
            status: 429,
            headers: { "Retry-After": "17" },
          },
        ),
      );
      const e429 = await galeriaApi
        .solicitarUpload(P, {
          fileName: "a.jpg",
          contentType: "image/jpeg",
          kind: "image",
          size: 10,
        })
        .catch((e: unknown) => e);
      expect(e429).toBeInstanceOf(ApiError);
      expect((e429 as InstanceType<typeof ApiError>).retryAfterSegundos).toBe(17);
      expect(envio.classificarErroMidia(e429, "solicitacao")).toMatchObject({
        tipo: "limite_requisicoes",
        retryAfterSegundos: 17,
      });

      respostas.push(
        new Response(
          JSON.stringify({ statusCode: 403, code: "FORBIDDEN", message: "Acesso não permitido." }),
          { status: 403 },
        ),
      );
      const e403 = await galeriaApi.listar(P).catch((e: unknown) => e);
      expect(envio.classificarErroMidia(e403, "reconciliacao").tipo).toBe("sem_permissao");
    } finally {
      globalThis.fetch = original;
      limparSessao();
    }
  });
});

describe("segurança", () => {
  test("nenhuma falha expõe a URL assinada", async () => {
    let urlVista = "";
    const r = await enviarImagem(
      deps({ transporte: async (req) => ((urlVista = req.url), { status: 403 }) }),
    );
    if (r.estado !== "falhou") throw new Error();
    expect(urlVista.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toContain(urlVista);
  });
});

// ─── Fase 22.8.9.9.9 (M4.1) — arquivo local ilegível ≠ falha de rede ───────────────────────────────────────────────

/**
 * `File` cuja LEITURA falha como a de um arquivo de disco movido/apagado/bloqueado depois da seleção: o navegador
 * rejeita a leitura com `NotReadableError`/`NotFoundError`. `quebrado` pode ser ligado no meio do envio.
 */
class ArquivoIlegivel extends File {
  quebrado: boolean;
  constructor(
    nome: string,
    tipo: string,
    private readonly nomeDoErro: "NotReadableError" | "NotFoundError",
    quebrado = true,
  ) {
    super([new Uint8Array(1024)], nome, { type: tipo });
    this.quebrado = quebrado;
  }
  override slice(...args: Parameters<Blob["slice"]>): Blob {
    const parte = super.slice(...args);
    if (!this.quebrado) return parte;
    const erro = new DOMException("Arquivo ilegível (sintético).", this.nomeDoErro);
    return Object.assign(parte, { arrayBuffer: () => Promise.reject(erro) });
  }
}

describe("M4.1 — arquivo local ilegível", () => {
  for (const nomeDoErro of ["NotReadableError", "NotFoundError"] as const) {
    test(`${nomeDoErro} antes do envio: mensagem própria, NENHUMA requisição, nenhum registro durável`, async () => {
      const chamadas: string[] = [];
      let puts = 0;
      const d = deps({ chamadas, transporte: async () => ((puts += 1), { status: 200 }) });
      const arquivo = new ArquivoIlegivel("foto.jpg", "image/jpeg", nomeDoErro);
      const r = await envio.enviarMidia({ produtoId: produto.id, arquivo, kind: "image" }, d);
      expect(r.estado).toBe("falhou");
      if (r.estado !== "falhou") throw new Error();
      expect(r.falha).toMatchObject({
        tipo: "arquivo_ilegivel",
        etapa: "validacao",
        incerta: false,
      });
      expect(r.falha.mensagem).toContain("Não foi possível ler o arquivo selecionado");
      expect(r.falha.mensagem).not.toContain("servidor");
      expect(r.uploadId).toBeNull();
      expect(chamadas).toEqual([]);
      expect(puts).toBe(0);
      expect(await d.pendencias.listarTodas()).toEqual({ pendentes: [], corrompidos: [] });
    });
  }

  // Sem conseguir ler o arquivo, o navegador falha sem resposta (0) ou envia o corpo incompleto, que o armazenamento
  // recusa (403 — observado no Chrome). Nos dois casos a causa é LOCAL.
  for (const status of [0, 403]) {
    test(`o arquivo deixa de ser legível DURANTE o PUT (status ${status}): 'arquivo_ilegivel', sem confirmação nem registro`, async () => {
      const chamadas: string[] = [];
      const arquivo = new ArquivoIlegivel("video.mp4", "video/mp4", "NotReadableError", false);
      const d = deps({
        chamadas,
        transporte: async () => {
          arquivo.quebrado = true; // movido/apagado enquanto o navegador lia o corpo
          return { status };
        },
      });
      const r = await envio.enviarMidia({ produtoId: produto.id, arquivo, kind: "video" }, d);
      expect(r.estado).toBe("falhou");
      if (r.estado !== "falhou") throw new Error();
      expect(r.falha).toMatchObject({ tipo: "arquivo_ilegivel", etapa: "envio" });
      expect(chamadas).toEqual(["solicitar"]);
      expect(await d.pendencias.listarTodas()).toEqual({ pendentes: [], corrompidos: [] });
    });
  }

  test("arquivo legível com recusa REAL do armazenamento (403) continua 'armazenamento_recusou'", async () => {
    const r = await enviarImagem(deps({ transporte: async () => ({ status: 403 }) }));
    expect(r.estado).toBe("falhou");
    if (r.estado !== "falhou") throw new Error();
    expect(r.falha.tipo).toBe("armazenamento_recusou");
  });

  test("falha de REDE real (arquivo legível, PUT sem resposta) continua 'rede', com a mensagem de conexão", async () => {
    const chamadas: string[] = [];
    const r = await enviarImagem(deps({ chamadas, transporte: async () => ({ status: 0 }) }));
    expect(r.estado).toBe("falhou");
    if (r.estado !== "falhou") throw new Error();
    expect(r.falha).toMatchObject({ tipo: "rede", etapa: "envio" });
    expect(r.falha.mensagem).toContain("Não foi possível falar com o servidor");
    expect(chamadas).toEqual(["solicitar"]);
  });

  test("arquivoLegivel: arquivo normal legível; ilegível não; a sonda lê só 1 byte", async () => {
    expect(await envio.arquivoLegivel(jpg())).toBe(true);
    expect(
      await envio.arquivoLegivel(new ArquivoIlegivel("a.jpg", "image/jpeg", "NotFoundError")),
    ).toBe(false);
    const fatias: Array<[number | undefined, number | undefined]> = [];
    class Espiao extends File {
      override slice(inicio?: number, fim?: number, tipo?: string): Blob {
        fatias.push([inicio, fim]);
        return super.slice(inicio, fim, tipo);
      }
    }
    await envio.arquivoLegivel(
      new Espiao([new Uint8Array(4 * MIB)], "g.jpg", { type: "image/jpeg" }),
    );
    expect(fatias).toEqual([[0, 1]]);
  });

  test("409/413/429/502/503/504 mantêm a classificação anterior", () => {
    const e = (statusCode: number, extra: Record<string, unknown> = {}) =>
      envio.classificarErroMidia(
        new ApiError({ statusCode, code: "X", message: "m", ...extra }),
        "solicitacao",
      ).tipo;
    expect([e(409), e(413), e(429), e(502), e(503), e(504)]).toEqual([
      "conflito",
      "muito_grande",
      "limite_requisicoes",
      "indisponivel",
      "indisponivel",
      "indisponivel",
    ]);
  });
});
