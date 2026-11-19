/**
 * Fase 22.8.9.9.4 (M3) — regras puras da fila de fotos (`src/components/produtos/fotos/fila-fotos.ts`).
 * Executar com: `bun test tests/unit`. Sem rede, sem React. Dados sintéticos.
 */
import { describe, expect, test } from "bun:test";

process.env.VITE_USE_MOCK_API = "false";
process.env.VITE_API_URL = "http://api.ficticia.invalid/api/v1";

const f = await import("@/components/produtos/fotos/fila-fotos");
type ItemFila = import("@/components/produtos/fotos/fila-fotos").ItemFila;
type MidiaProduto = import("@/types/media").MidiaProduto;

const MIB = 1024 * 1024;
const foto = (nome: string, tipo = "image/jpeg", tamanho = 2048) =>
  new File([new Uint8Array(tamanho)], nome, { type: tipo });
const item = (estado: ItemFila["estado"], substitui: string | null = null): ItemFila => ({
  ...f.novoItem(foto("x.jpg"), `i-${Math.random()}`, "blob:ficticio", substitui),
  estado,
});

describe("seleção (1–5)", () => {
  test("1. várias fotos válidas de uma vez são aceitas, na ordem", () => {
    const r = f.validarSelecao(
      [foto("a.jpg"), foto("b.png", "image/png"), foto("c.webp", "image/webp")],
      10,
    );
    expect(r.aceitos.map((a) => a.name)).toEqual(["a.jpg", "b.png", "c.webp"]);
    expect(r.recusados).toEqual([]);
  });

  test("2. seleção incremental: as vagas consideram o que já está na fila", () => {
    const fila = [item("aguardando"), item("enviando"), item("concluida"), item("falhou")];
    // 10 − 6 na galeria − 2 na fila (aguardando + enviando; concluída já conta na galeria; falhou não ocupa)
    expect(f.vagasRestantes(6, fila)).toBe(2);
    const r = f.validarSelecao(
      [foto("d.jpg"), foto("e.jpg"), foto("f.jpg")],
      f.vagasRestantes(6, fila),
    );
    expect(r.aceitos.map((a) => a.name)).toEqual(["d.jpg", "e.jpg"]);
    expect(r.recusados[0]).toMatchObject({ nome: "f.jpg" });
    expect(r.recusados[0]!.motivo).toContain("Limite de 10 fotos");
  });

  test("3. formato inválido recusado antes de qualquer requisição (GIF, vídeo, extensão trocada)", () => {
    const r = f.validarSelecao(
      [foto("a.gif", "image/gif"), foto("v.mp4", "video/mp4"), foto("a.png", "image/jpeg")],
      10,
    );
    expect(r.aceitos).toEqual([]);
    expect(r.recusados.map((x) => x.nome)).toEqual(["a.gif", "v.mp4", "a.png"]);
  });

  test("4. acima de 5 MiB recusado; exatamente 5 MiB aceito", () => {
    const r = f.validarSelecao(
      [foto("grande.jpg", "image/jpeg", 5 * MIB + 1), foto("limite.jpg", "image/jpeg", 5 * MIB)],
      10,
    );
    expect(r.aceitos.map((a) => a.name)).toEqual(["limite.jpg"]);
    expect(r.recusados[0]!.motivo).toContain("5 MB");
  });

  test("5. limite de 10: galeria cheia não aceita nova foto; substituição não consome vaga", () => {
    expect(f.vagasRestantes(10, [])).toBe(0);
    expect(f.validarSelecao([foto("a.jpg")], 0).aceitos).toEqual([]);
    expect(f.validarSelecao([foto("a.jpg")], 0, { substituicao: true }).aceitos).toHaveLength(1);
    // Substituições na fila também não ocupam vaga; pendências e não enviadas ocupam.
    expect(
      f.vagasRestantes(8, [
        item("aguardando", "m1"),
        item("confirmacao_pendente"),
        item("confirmacao_nao_enviada"),
      ]),
    ).toBe(0);
  });
});

describe("envio", () => {
  test("concorrência 1: só um item em andamento por vez, na ordem de seleção", () => {
    const a = item("aguardando");
    const b = item("aguardando");
    expect(f.ENVIOS_SIMULTANEOS).toBe(1);
    expect(f.proximoParaEnviar([a, b])).toBe(a);
    expect(f.proximoParaEnviar([{ ...a, estado: "enviando" }, b])).toBeNull();
    expect(f.proximoParaEnviar([{ ...a, estado: "concluida" }, b])).toBe(b);
    expect(
      f.proximoParaEnviar([
        { ...a, estado: "falhou" },
        { ...b, estado: "confirmacao_pendente" },
      ]),
    ).toBeNull();
  });

  test("10. progresso individual em percentual inteiro; total desconhecido = sem percentual", () => {
    expect(f.percentual(0, 2048)).toBe(0);
    expect(f.percentual(1024, 2048)).toBe(50);
    expect(f.percentual(2048, 2048)).toBe(100);
    expect(f.percentual(3000, 2048)).toBe(100);
    expect(f.percentual(10, 0)).toBeNull();
  });

  test("rótulos: formato e tamanho legíveis; todos os estados têm texto (não só cor)", () => {
    expect(f.rotuloFormato("image/jpeg")).toBe("JPEG");
    expect(f.rotuloFormato("image/webp")).toBe("WEBP");
    expect(f.formatarTamanho(512)).toBe("512 B");
    expect(f.formatarTamanho(2048)).toBe("2 KB");
    expect(f.formatarTamanho(5 * MIB)).toBe("5,0 MB");
    for (const estado of [
      "aguardando",
      "solicitando",
      "enviando",
      "confirmando",
      "concluida",
      "falhou",
      "confirmacao_pendente",
      "confirmacao_nao_enviada",
    ] as const) {
      expect(f.ROTULO_ESTADO[estado].length).toBeGreaterThan(0);
    }
  });

  test("o item da fila guarda o arquivo e a URL blob só em memória (nada disso vai ao registro durável)", () => {
    const i = f.novoItem(foto("a.jpg"), "id-1", "blob:http://localhost/abc");
    expect(i).toMatchObject({
      estado: "aguardando",
      previewUrl: "blob:http://localhost/abc",
      uploadId: null,
      retomar: null,
    });
  });
});

describe("ordenação (14)", () => {
  const m = (id: string, ordem: number, tipo: "image" | "video" = "image") =>
    ({ id, ordem, tipo }) as unknown as MidiaProduto;

  test("troca só as duas imagens vizinhas; o vídeo e as demais mantêm o lugar; lista completa", () => {
    const midias = [m("a", 0), m("v", 1, "video"), m("b", 2), m("c", 3)];
    expect(f.ordemComTroca(midias, "a", "b")).toEqual(["b", "v", "a", "c"]);
    expect(f.ordemComTroca(midias, "c", "b")).toEqual(["a", "v", "c", "b"]);
    expect(f.ordemComTroca(midias, "a", "inexistente")).toEqual(["a", "v", "b", "c"]);
  });
});

// ─── Fase 22.8.9.9.6 (M4) — vídeo ─────────────────────────────────────────────────────────────────────────────────

describe("vídeo (M4)", () => {
  const video = (nome: string, tipo = "video/mp4", tamanho = 4096) =>
    new File([new Uint8Array(tamanho)], nome, { type: tipo });

  test("1, 2, 3. MP4 aceito; outros formatos e acima de 15 MiB recusados (regras do backend)", () => {
    const r = f.validarSelecao(
      [
        video("ok.mp4"),
        video("a.webm", "video/webm"),
        video("b.mov", "video/quicktime"),
        video("c.mp4", "video/mp4", 15 * MIB + 1),
        foto("x.jpg"),
      ],
      5,
      { kind: "video" },
    );
    expect(r.aceitos.map((a) => a.name)).toEqual(["ok.mp4"]);
    expect(r.recusados.map((x) => x.nome)).toEqual(["a.webm", "b.mov", "c.mp4", "x.jpg"]);
    expect(r.recusados[2]!.motivo).toContain("15 MB");
  });

  test("5. limite de 1 vídeo: com vídeo na galeria ou na fila não há vaga; a substituição não consome vaga", () => {
    expect(f.vagasRestantes(0, [], "video")).toBe(1);
    expect(f.vagasRestantes(1, [], "video")).toBe(0);
    expect(f.vagasRestantes(0, [item("aguardando")], "video")).toBe(0);
    const semVaga = f.validarSelecao([video("b.mp4")], 0, { kind: "video" });
    expect(semVaga.aceitos).toEqual([]);
    expect(semVaga.recusados[0]!.motivo).toContain("Limite de 1 vídeo");
    expect(
      f.validarSelecao([video("b.mp4")], 0, { kind: "video", substituicao: true }).aceitos,
    ).toHaveLength(1);
  });

  test("4. duração: acima de 30 s recusada; até 30 s ou desconhecida segue (o backend confere)", () => {
    expect(f.DURACAO_MAXIMA_VIDEO_S).toBe(30);
    expect(f.motivoDuracao(30)).toBeNull();
    expect(f.motivoDuracao(null)).toBeNull();
    expect(f.motivoDuracao(45.4)).toBe("O vídeo tem 45 s; o máximo é 30 s.");
    expect(f.formatarDuracao(95)).toBe("1 min 35 s");
  });

  test("lerDuracaoVideo: só metadados; libera a URL blob: em todos os desfechos", async () => {
    function falso(desfecho: "metadados" | "erro" | "nada", duracao = 12.5) {
      const liberadas: string[] = [];
      const el = {
        preload: "",
        muted: false,
        duration: duracao,
        onloadedmetadata: null as (() => void) | null,
        onerror: null as (() => void) | null,
        removeAttribute: () => undefined,
        load: () => undefined,
        set src(_v: string) {
          setTimeout(
            () =>
              desfecho === "metadados"
                ? el.onloadedmetadata?.()
                : desfecho === "erro"
                  ? el.onerror?.()
                  : undefined,
            0,
          );
        },
        get src() {
          return "";
        },
      };
      return {
        el,
        liberadas,
        opcoes: {
          criarElemento: () => el,
          criarUrl: () => "blob:teste",
          liberarUrl: (u: string) => void liberadas.push(u),
          prazoMs: 50,
        },
      };
    }
    const ok = falso("metadados");
    expect(await f.lerDuracaoVideo(new Blob(["x"]), ok.opcoes)).toBe(12.5);
    expect(ok.el.preload).toBe("metadata");
    expect(ok.liberadas).toEqual(["blob:teste"]);
    const erro = falso("erro");
    expect(await f.lerDuracaoVideo(new Blob(["x"]), erro.opcoes)).toBeNull();
    expect(erro.liberadas).toEqual(["blob:teste"]);
    const prazo = falso("nada");
    expect(await f.lerDuracaoVideo(new Blob(["x"]), prazo.opcoes)).toBeNull();
    expect(prazo.liberadas).toEqual(["blob:teste"]);
    const infinita = falso("metadados", Number.POSITIVE_INFINITY);
    expect(await f.lerDuracaoVideo(new Blob(["x"]), infinita.opcoes)).toBeNull();
  });
});

// ─── Fase 22.8.9.9.9 (M4.1) — cada item pertence a UM produto ──────────────────────────────────────────────────────

describe("M4.1 — dono da fila", () => {
  const de = (dono: string | null, estado: ItemFila["estado"] = "aguardando"): ItemFila => ({
    ...f.novoItem(
      foto(`${dono}.jpg`),
      `i-${dono}-${Math.random()}`,
      "blob:ficticio",
      null,
      null,
      dono,
    ),
    estado,
  });

  test("o item guarda o produto dono; sem dono só no cadastro (null)", () => {
    expect(f.novoItem(foto("a.jpg"), "1", "blob:x").produtoId).toBeNull();
    expect(f.novoItem(foto("a.jpg"), "1", "blob:x", null, null, "prod-a").produtoId).toBe("prod-a");
  });

  test("pertenceAo / itensDoProduto: um item de A nunca aparece nem vale para B", () => {
    const a = de("prod-a");
    const b = de("prod-b");
    const cadastro = de(null);
    expect(f.pertenceAo(a, "prod-a")).toBe(true);
    expect(f.pertenceAo(a, "prod-b")).toBe(false);
    expect(f.pertenceAo(cadastro, "prod-b")).toBe(true);
    expect(f.itensDoProduto([a, b, cadastro], "prod-b")).toEqual([b, cadastro]);
  });

  test("proximoParaEnviar com destino: NUNCA escolhe arquivo de outro produto", () => {
    const a = de("prod-a");
    const b = de("prod-b");
    expect(f.proximoParaEnviar([a, b], "prod-b")).toBe(b);
    expect(f.proximoParaEnviar([a], "prod-b")).toBeNull();
    // Sem destino (comportamento anterior), a ordem de seleção continua valendo.
    expect(f.proximoParaEnviar([a, b])).toBe(a);
    // A concorrência continua contando QUALQUER envio em andamento da fila.
    expect(f.proximoParaEnviar([de("prod-a", "enviando"), b], "prod-b")).toBeNull();
  });

  test("vagas do produto contam só os itens dele", () => {
    const fila = [de("prod-a"), de("prod-a"), de("prod-b")];
    expect(f.vagasRestantes(0, f.itensDoProduto(fila, "prod-b"))).toBe(9);
  });
});
