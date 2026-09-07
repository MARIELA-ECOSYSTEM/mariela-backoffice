import { describe, expect, it, vi, beforeEach } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
vi.mock("./client", () => ({ apiClient: apiClientMock }));

const { produtosApi, PAGINA_PADRAO_PRODUTOS, LIMITE_PADRAO_PRODUTOS } =
  await import("./produtos.api");

describe("produtosApi.listar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia page e limit informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 3, limit: 10, total: 25, totalPages: 3 },
      facets: {},
    });

    await produtosApi.listar({ page: 3, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/produtos",
      expect.objectContaining({ params: expect.objectContaining({ page: 3, limit: 10 }) }),
    );
  });

  it("usa page=1 e limit=20 como default quando não informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await produtosApi.listar({});

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/produtos",
      expect.objectContaining({
        params: expect.objectContaining({
          page: PAGINA_PADRAO_PRODUTOS,
          limit: LIMITE_PADRAO_PRODUTOS,
        }),
      }),
    );
  });

  it("envia busca, ordenarPor e ordem", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await produtosApi.listar({ busca: "vestido", ordenarPor: "precoVenda", ordem: "desc" });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({
      busca: "vestido",
      ordenarPor: "precoVenda",
      ordem: "desc",
    });
  });

  it("envia a seleção de facetas como CSV", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await produtosApi.listar({
      facetas: { categorias: ["Vestidos", "Blusas"], estoque: ["com_estoque"] },
    });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ categorias: "Vestidos,Blusas", estoque: "com_estoque" });
  });

  it("não envia filtros ausentes (nenhum parâmetro undefined vaza como string 'undefined')", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await produtosApi.listar({});

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params.busca).toBeUndefined();
    expect(opcoes.params.ordenarPor).toBeUndefined();
  });

  it("interpreta corretamente a paginação e as facetas da resposta", async () => {
    const produto = { id: "p1", nome: "Vestido" };
    apiClientMock.get.mockResolvedValueOnce({
      data: [produto],
      meta: { page: 2, limit: 20, total: 45, totalPages: 3 },
      facets: { categorias: [{ valor: "Vestidos", count: 45 }] },
    });

    const resultado = await produtosApi.listar({ page: 2 });

    expect(resultado.produtos).toEqual([produto]);
    expect(resultado.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
    expect(resultado.facets).toEqual({ categorias: [{ valor: "Vestidos", count: 45 }] });
  });

  it("preenche meta com defaults seguros quando o backend não devolve nada (nunca finge um total real)", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: undefined, facets: undefined });

    const resultado = await produtosApi.listar({ page: 1, limit: 20 });

    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
    expect(resultado.facets).toEqual({});
  });
});
