import { describe, expect, it, vi, beforeEach } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
vi.mock("./client", () => ({ apiClient: apiClientMock }));

const { caixasApi, PAGINA_PADRAO_CAIXAS, LIMITE_PADRAO_CAIXAS } = await import("./caixas.api");

describe("caixasApi.listar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia page e limit informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 2, limit: 10, total: 15, totalPages: 2 },
      facets: {},
    });

    await caixasApi.listar({ page: 2, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/caixas",
      expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 10 }) }),
    );
  });

  it("usa page=1 e limit=20 como default quando não informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await caixasApi.listar({});

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/caixas",
      expect.objectContaining({
        params: expect.objectContaining({
          page: PAGINA_PADRAO_CAIXAS,
          limit: LIMITE_PADRAO_CAIXAS,
        }),
      }),
    );
  });

  it("envia busca, ordenarPor e ordem", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await caixasApi.listar({ busca: "CAIXA-0001", ordenarPor: "saldo", ordem: "desc" });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({
      busca: "CAIXA-0001",
      ordenarPor: "saldo",
      ordem: "desc",
    });
  });

  it("envia a seleção de facetas como CSV", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await caixasApi.listar({ facetas: { status: ["aberto"], periodo: ["hoje", "7d"] } });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ status: "aberto", periodo: "hoje,7d" });
  });

  it("usa defaults quando o backend não devolve meta/facets", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [] });

    const resultado = await caixasApi.listar({});

    expect(resultado).toEqual({
      caixas: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      facets: {},
    });
  });
});

describe("caixasApi.movimentacoes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia tipo, page e limit", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 1, limit: 50, total: 0, totalPages: 1 },
    });

    await caixasApi.movimentacoes("cx1", { tipo: ["entrada", "saida"], page: 2, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/caixas/cx1/movimentacoes",
      expect.objectContaining({
        params: expect.objectContaining({ tipo: "entrada,saida", page: 2, limit: 10 }),
      }),
    );
  });

  it("usa limit padrão de 50 quando não informado", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {} });

    await caixasApi.movimentacoes("cx1");

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params.limit).toBe(50);
  });
});

describe("caixasApi — operações", () => {
  beforeEach(() => vi.clearAllMocks());

  it("abrir chama POST /caixas com o payload", async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { id: "cx1" } });
    await caixasApi.abrir({ responsavelId: null, valorInicial: 100, observacao: "" });
    expect(apiClientMock.post).toHaveBeenCalledWith("/caixas", {
      responsavelId: null,
      valorInicial: 100,
      observacao: "",
    });
  });

  it("entrada repassa idempotencyKey no payload", async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { id: "cx1" } });
    await caixasApi.entrada("cx1", {
      descricao: "Suprimento",
      valor: 50,
      formaPagamento: "Dinheiro",
      idempotencyKey: "chave-123",
    });
    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/caixas/cx1/entrada",
      expect.objectContaining({ idempotencyKey: "chave-123" }),
    );
  });

  it("fechar chama POST /caixas/:id/fechamento", async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { id: "cx1", status: "fechado" } });
    await caixasApi.fechar("cx1", { valorInformado: 100 });
    expect(apiClientMock.post).toHaveBeenCalledWith("/caixas/cx1/fechamento", {
      valorInformado: 100,
    });
  });
});
