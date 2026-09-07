import { describe, expect, it, vi, beforeEach } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
vi.mock("./client", () => ({ apiClient: apiClientMock }));

const { vendasApi, PAGINA_PADRAO_VENDAS, LIMITE_PADRAO_VENDAS } = await import("./vendas.api");

describe("vendasApi.listar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia page e limit informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 2, limit: 10, total: 15, totalPages: 2 },
      facets: {},
    });

    await vendasApi.listar({ page: 2, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/vendas",
      expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 10 }) }),
    );
  });

  it("usa page=1 e limit=20 como default quando não informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await vendasApi.listar({});

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/vendas",
      expect.objectContaining({
        params: expect.objectContaining({
          page: PAGINA_PADRAO_VENDAS,
          limit: LIMITE_PADRAO_VENDAS,
        }),
      }),
    );
  });

  it("envia busca, ordenarPor e ordem", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await vendasApi.listar({ busca: "VENDA-0001", ordenarPor: "valor", ordem: "desc" });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({
      busca: "VENDA-0001",
      ordenarPor: "valor",
      ordem: "desc",
    });
  });

  it("envia a seleção de facetas como CSV", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await vendasApi.listar({
      facetas: { status: ["concluida"], condicoes: ["promocao", "desconto"] },
    });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ status: "concluida", condicoes: "promocao,desconto" });
  });

  it("usa defaults quando o backend não devolve meta/facets", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [] });

    const resultado = await vendasApi.listar({});

    expect(resultado).toEqual({
      vendas: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      facets: {},
    });
  });
});

describe("vendasApi — operações administrativas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("baixarParcela chama POST no endpoint de baixa", async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { id: "v1" } });
    await vendasApi.baixarParcela("v1", "p1", { formaPagamento: "PIX" });
    expect(apiClientMock.post).toHaveBeenCalledWith("/vendas/v1/parcelas/p1/baixa", {
      formaPagamento: "PIX",
    });
  });

  it("cancelar chama POST no endpoint de cancelamento", async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { id: "v1", status: "cancelada" } });
    await vendasApi.cancelar("v1", { tipo: "integral", motivo: "Teste" });
    expect(apiClientMock.post).toHaveBeenCalledWith("/vendas/v1/cancelamento", {
      tipo: "integral",
      motivo: "Teste",
    });
  });
});
