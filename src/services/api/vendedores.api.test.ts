import { describe, expect, it, vi, beforeEach } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};
vi.mock("./client", () => ({ apiClient: apiClientMock }));

const { vendedoresApi, PAGINA_PADRAO_VENDEDORES, LIMITE_PADRAO_VENDEDORES } =
  await import("./vendedores.api");

describe("vendedoresApi.listar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia page e limit informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({
      data: [],
      meta: { page: 2, limit: 10, total: 15, totalPages: 2 },
      facets: {},
    });

    await vendedoresApi.listar({ page: 2, limit: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/vendedores",
      expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 10 }) }),
    );
  });

  it("usa page=1 e limit=20 como default quando não informados", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await vendedoresApi.listar({});

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/vendedores",
      expect.objectContaining({
        params: expect.objectContaining({
          page: PAGINA_PADRAO_VENDEDORES,
          limit: LIMITE_PADRAO_VENDEDORES,
        }),
      }),
    );
  });

  it("envia busca, ordenarPor e ordem", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await vendedoresApi.listar({ busca: "Mariana", ordenarPor: "vendas", ordem: "desc" });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ busca: "Mariana", ordenarPor: "vendas", ordem: "desc" });
  });

  it("envia a seleção de facetas como CSV", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await vendedoresApi.listar({
      facetas: { vendas: ["sem", "21+"], observacao: ["com"] },
    });

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(opcoes.params).toMatchObject({ vendas: "sem,21+", observacao: "com" });
  });

  it("não vaza parâmetros ausentes como a string 'undefined'", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [], meta: {}, facets: {} });

    await vendedoresApi.listar({});

    const [, opcoes] = apiClientMock.get.mock.calls[0]!;
    expect(JSON.stringify(opcoes.params)).not.toContain("undefined");
  });

  it("usa defaults quando o backend não devolve meta/facets", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [] });

    const resultado = await vendedoresApi.listar({});

    expect(resultado).toEqual({
      vendedores: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      facets: {},
    });
  });

  it("listarVendas chama o endpoint de histórico do vendedor", async () => {
    apiClientMock.get.mockResolvedValueOnce({ data: [] });

    await vendedoresApi.listarVendas("ven_001");

    expect(apiClientMock.get).toHaveBeenCalledWith("/vendedores/ven_001/vendas");
  });

  it("redefinirSenha chama PATCH no endpoint de senha", async () => {
    apiClientMock.patch.mockResolvedValueOnce({ data: {} });

    await vendedoresApi.redefinirSenha("ven_001", { senha: "novaSenha1" });

    expect(apiClientMock.patch).toHaveBeenCalledWith("/vendedores/ven_001/senha", {
      senha: "novaSenha1",
    });
  });
});
