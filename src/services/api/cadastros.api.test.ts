import { describe, expect, it, vi, beforeEach } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
vi.mock("./client", () => ({ apiClient: apiClientMock }));

const {
  clientesApi,
  PAGINA_PADRAO_CLIENTES,
  LIMITE_PADRAO_CLIENTES,
  fornecedoresApi,
  PAGINA_PADRAO_FORNECEDORES,
  LIMITE_PADRAO_FORNECEDORES,
  colecoesApi,
  PAGINA_PADRAO_COLECOES,
  LIMITE_PADRAO_COLECOES,
  campanhasApi,
  PAGINA_PADRAO_CAMPANHAS,
  LIMITE_PADRAO_CAMPANHAS,
} = await import("./cadastros.api");

describe("clientesApi.listar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia page e limit informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 2, limit: 10, total: 15, totalPages: 2 },
      facets: {},
    });

    await clientesApi.listar({ page: 2, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/clientes",
      expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 10 }) }),
    );
  });

  it("usa page=1 e limit=20 como default quando não informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await clientesApi.listar({});

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/clientes",
      expect.objectContaining({
        params: expect.objectContaining({
          page: PAGINA_PADRAO_CLIENTES,
          limit: LIMITE_PADRAO_CLIENTES,
        }),
      }),
    );
  });

  it("envia busca, ordenarPor e ordem", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await clientesApi.listar({ busca: "Maria", ordenarPor: "ultimaCompra", ordem: "desc" });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({
      busca: "Maria",
      ordenarPor: "ultimaCompra",
      ordem: "desc",
    });
  });

  it("envia a seleção de facetas como CSV", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await clientesApi.listar({
      facetas: { historico: ["com", "recorrente"], observacao: ["com"] },
    });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ historico: "com,recorrente", observacao: "com" });
  });

  it("não vaza parâmetros ausentes como a string 'undefined'", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await clientesApi.listar({});

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params.busca).toBeUndefined();
    expect(opcoes.params.ordenarPor).toBeUndefined();
  });

  it("interpreta corretamente a paginação e as facetas da resposta", async () => {
    const cliente = { id: "c1", nome: "Maria" };
    apiClientMock.get.mockResolvedValueOnce({
      data: [cliente],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      facets: { historico: [{ valor: "com", count: 1 }] },
    });

    const resultado = await clientesApi.listar({});

    expect(resultado.clientes).toEqual([cliente]);
    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(resultado.facets).toEqual({ historico: [{ valor: "com", count: 1 }] });
  });

  it("preenche meta com defaults seguros quando o backend não devolve nada", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: undefined, facets: undefined });

    const resultado = await clientesApi.listar({ page: 1, limit: 20 });

    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
    expect(resultado.facets).toEqual({});
  });
});

describe("fornecedoresApi.listar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia page e limit informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 2, limit: 10, total: 15, totalPages: 2 },
      facets: {},
    });

    await fornecedoresApi.listar({ page: 2, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/fornecedores",
      expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 10 }) }),
    );
  });

  it("usa page=1 e limit=20 como default quando não informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await fornecedoresApi.listar({});

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/fornecedores",
      expect.objectContaining({
        params: expect.objectContaining({
          page: PAGINA_PADRAO_FORNECEDORES,
          limit: LIMITE_PADRAO_FORNECEDORES,
        }),
      }),
    );
  });

  it("envia busca, ordenarPor e ordem", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await fornecedoresApi.listar({ busca: "Ipê", ordenarPor: "valorEmCusto", ordem: "desc" });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({
      busca: "Ipê",
      ordenarPor: "valorEmCusto",
      ordem: "desc",
    });
  });

  it("envia a seleção de facetas como CSV", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await fornecedoresApi.listar({ facetas: { produtos: ["1-5", "16+"], documento: ["com"] } });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ produtos: "1-5,16+", documento: "com" });
  });

  it("interpreta corretamente a paginação e as facetas da resposta", async () => {
    const fornecedor = { id: "f1", nome: "Confecções Ipê" };
    apiClientMock.get.mockResolvedValueOnce({
      data: [fornecedor],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      facets: { documento: [{ valor: "com", count: 1 }] },
    });

    const resultado = await fornecedoresApi.listar({});

    expect(resultado.fornecedores).toEqual([fornecedor]);
    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(resultado.facets).toEqual({ documento: [{ valor: "com", count: 1 }] });
  });

  it("preenche meta com defaults seguros quando o backend não devolve nada", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: undefined, facets: undefined });

    const resultado = await fornecedoresApi.listar({ page: 1, limit: 20 });

    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
    expect(resultado.facets).toEqual({});
  });
});

describe("colecoesApi.listar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia page e limit informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 2, limit: 10, total: 15, totalPages: 2 },
      facets: {},
    });

    await colecoesApi.listar({ page: 2, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/colecoes",
      expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 10 }) }),
    );
  });

  it("usa page=1 e limit=20 como default quando não informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await colecoesApi.listar({});

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/colecoes",
      expect.objectContaining({
        params: expect.objectContaining({
          page: PAGINA_PADRAO_COLECOES,
          limit: LIMITE_PADRAO_COLECOES,
        }),
      }),
    );
  });

  it("envia busca, ordenarPor e ordem", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await colecoesApi.listar({ busca: "Verão", ordenarPor: "criadoEm", ordem: "desc" });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ busca: "Verão", ordenarPor: "criadoEm", ordem: "desc" });
  });

  it("envia a seleção de facetas como CSV", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await colecoesApi.listar({ facetas: { situacao: ["ativa", "agendada"], destaque: ["sim"] } });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ situacao: "ativa,agendada", destaque: "sim" });
  });

  it("interpreta corretamente a paginação e as facetas da resposta", async () => {
    const colecao = { id: "c1", nome: "Verão 2026" };
    apiClientMock.get.mockResolvedValueOnce({
      data: [colecao],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      facets: { destaque: [{ valor: "sim", count: 1 }] },
    });

    const resultado = await colecoesApi.listar({});

    expect(resultado.colecoes).toEqual([colecao]);
    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(resultado.facets).toEqual({ destaque: [{ valor: "sim", count: 1 }] });
  });

  it("preenche meta com defaults seguros quando o backend não devolve nada", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: undefined, facets: undefined });

    const resultado = await colecoesApi.listar({ page: 1, limit: 20 });

    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
    expect(resultado.facets).toEqual({});
  });

  it("listarProdutos busca produtos vinculados à coleção", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [{ id: "p1", nome: "Vestido" }] });

    const produtos = await colecoesApi.listarProdutos("c1");

    expect(apiClientMock.get).toHaveBeenCalledWith("/colecoes/c1/produtos");
    expect(produtos).toEqual([{ id: "p1", nome: "Vestido" }]);
  });
});

describe("campanhasApi.listar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia page e limit informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 2, limit: 10, total: 15, totalPages: 2 },
      facets: {},
    });

    await campanhasApi.listar({ page: 2, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/campanhas",
      expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 10 }) }),
    );
  });

  it("usa page=1 e limit=20 como default quando não informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await campanhasApi.listar({});

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/campanhas",
      expect.objectContaining({
        params: expect.objectContaining({
          page: PAGINA_PADRAO_CAMPANHAS,
          limit: LIMITE_PADRAO_CAMPANHAS,
        }),
      }),
    );
  });

  it("envia busca, ordenarPor e ordem", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await campanhasApi.listar({ busca: "Verão", ordenarPor: "criadoEm", ordem: "desc" });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ busca: "Verão", ordenarPor: "criadoEm", ordem: "desc" });
  });

  it("envia a seleção de facetas como CSV", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await campanhasApi.listar({ facetas: { situacao: ["ativa", "agendada"], destaque: ["sim"] } });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ situacao: "ativa,agendada", destaque: "sim" });
  });

  it("interpreta corretamente a paginação e as facetas da resposta", async () => {
    const campanha = { id: "c1", nome: "Lançamento Verão" };
    apiClientMock.get.mockResolvedValueOnce({
      data: [campanha],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      facets: { destaque: [{ valor: "sim", count: 1 }] },
    });

    const resultado = await campanhasApi.listar({});

    expect(resultado.campanhas).toEqual([campanha]);
    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(resultado.facets).toEqual({ destaque: [{ valor: "sim", count: 1 }] });
  });

  it("preenche meta com defaults seguros quando o backend não devolve nada", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: undefined, facets: undefined });

    const resultado = await campanhasApi.listar({ page: 1, limit: 20 });

    expect(resultado.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
    expect(resultado.facets).toEqual({});
  });

  it("listarProdutos busca produtos vinculados à campanha", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [{ id: "p1", nome: "Vestido" }] });

    const produtos = await campanhasApi.listarProdutos("c1");

    expect(apiClientMock.get).toHaveBeenCalledWith("/campanhas/c1/produtos");
    expect(produtos).toEqual([{ id: "p1", nome: "Vestido" }]);
  });
});
