import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import type { VendaFiltros, VendaResumo } from "@/types/venda";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouter: () => ({ state: { location: { pathname: "/vendas" } } }),
    // `VendaCard` usa `Link` de verdade para "Ver detalhes"/valor — exige um
    // RouterProvider de verdade. Como este teste é sobre paginação/filtros,
    // não sobre navegação, um link burro evita montar toda a árvore de rotas.
    Link: ({
      children,
      to,
      ...props
    }: {
      children?: ReactNode;
      to?: string;
      [chave: string]: unknown;
    }) => (
      <a href={typeof to === "string" ? to : "#"} {...props}>
        {children}
      </a>
    ),
  };
});

function venda(overrides: Partial<VendaResumo> & { id: string; codigo: string }): VendaResumo {
  return {
    numero: overrides.codigo,
    dataVenda: "2026-01-01T12:00:00.000Z",
    clienteId: null,
    clienteNome: "Consumidor final",
    vendedorId: "ven_1",
    vendedorNome: "Vendedora Teste",
    caixaId: "cx_1",
    caixaCodigo: "CAIXA-0001",
    totalItens: 1,
    valorBruto: 100,
    descontoPromocional: 0,
    descontoVenda: 0,
    descontoTotal: 0,
    valorFinal: 100,
    valorPago: 100,
    valorPendente: 0,
    valorDevolvido: 0,
    temPromocao: false,
    temDesconto: false,
    formaPagamento: "Dinheiro",
    totalParcelas: 1,
    parcelasPagas: 1,
    status: "concluida",
    ...overrides,
  };
}

/** Base de 20 vendas — mais que a `POR_PAGINA` da tela (12), exigindo mais de uma página. */
const BASE = Array.from({ length: 20 }, (_, indice) =>
  venda({
    id: String(indice + 1),
    codigo: `VENDA-2026-01-01-${String(indice + 1).padStart(4, "0")}`,
  }),
);

const listarMock = vi.fn();
vi.mock("@/services/api/vendas.api", () => ({
  PAGINA_PADRAO_VENDAS: 1,
  LIMITE_PADRAO_VENDAS: 20,
  LIMITE_MAXIMO_VENDAS: 100,
  vendasApi: {
    listar: listarMock,
    estatisticas: vi.fn().mockResolvedValue({
      totalVendas: 0,
      faturamento: 0,
      ticketMedio: 0,
      itensVendidos: 0,
      vendasEmPagamento: 0,
      valorEmAberto: 0,
      vendasCanceladas: 0,
      valorCancelado: 0,
      descontoConcedido: 0,
    }),
    obter: vi.fn(),
    baixarParcela: vi.fn(),
    cancelar: vi.fn(),
  },
}));

vi.mock("@/services/api/vendedores.api", () => ({
  PAGINA_PADRAO_VENDEDORES: 1,
  LIMITE_PADRAO_VENDEDORES: 20,
  LIMITE_MAXIMO_VENDEDORES: 100,
  vendedoresApi: {
    listar: vi.fn().mockResolvedValue({
      vendedores: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 1 },
      facets: {},
    }),
  },
}));

vi.mock("@/services/api/cadastros.api", () => ({
  PAGINA_PADRAO_CLIENTES: 1,
  LIMITE_PADRAO_CLIENTES: 20,
  LIMITE_MAXIMO_CLIENTES: 100,
  clientesApi: {
    listar: vi.fn().mockResolvedValue({
      clientes: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 1 },
      facets: {},
    }),
  },
  fornecedoresApi: { listar: vi.fn().mockResolvedValue([]) },
  colecoesApi: { listar: vi.fn().mockResolvedValue([]) },
  campanhasApi: { listar: vi.fn().mockResolvedValue([]) },
}));

const FACETS_VAZIOS = {
  status: [],
  periodo: [],
  vendedor: [],
  cliente: [],
  pagamento: [],
  caixa: [],
  valor: [],
  condicoes: [],
  financeiro: [],
};

/** Simula o backend real: filtra por busca (código/cliente/vendedor/pagamento) e fatia por page/limit. */
function respostaPaginada(filtros: VendaFiltros) {
  const termo = filtros.busca?.trim().toLowerCase();
  const filtrados = termo ? BASE.filter((item) => item.codigo.toLowerCase().includes(termo)) : BASE;
  const page = filtros.page ?? 1;
  const limit = filtros.limit ?? 12;
  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = (page - 1) * limit;
  return {
    vendas: filtrados.slice(inicio, inicio + limit),
    meta: { page, limit, total, totalPages },
    facets: FACETS_VAZIOS,
  };
}

const { Route } = await import("./vendas.index");
const VendasPage = Route.options.component!;

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VendasPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Tela de Vendas — paginação e filtros server-side", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    listarMock.mockImplementation(async (filtros: VendaFiltros = {}) => respostaPaginada(filtros));
  });

  it("carrega a primeira página com page=1 e limit=12 (POR_PAGINA da tela) por padrão", async () => {
    renderPagina();

    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());
    expect(listarMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 12 }));
    expect(screen.getByText(/20 venda\(s\) encontrada\(s\)/)).toBeTruthy();
    expect(screen.getByText(/página 1 de 2/)).toBeTruthy();
  });

  it("mostra o skeleton enquanto a primeira página carrega", async () => {
    let resolver!: (valor: ReturnType<typeof respostaPaginada>) => void;
    listarMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );

    const { container } = renderPagina();
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);

    resolver(respostaPaginada({ page: 1, limit: 12 }));
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());
  });

  it("próxima página: chama a API com page=2 e mostra os itens seguintes", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0013")).toBeTruthy());
    expect(screen.getByText(/página 2 de 2/)).toBeTruthy();
    expect(screen.queryByText("VENDA-2026-01-01-0001")).toBeNull();
  });

  it("página anterior: volta para page=1 a partir da page=2", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 2/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })),
    );
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());
  });

  it("bloqueia avançar além da última página", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 2/)).toBeTruthy());

    const botaoProxima = screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement;
    expect(botaoProxima.disabled).toBe(true);
  });

  it("bloqueia voltar antes da primeira página", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());
    const botaoAnterior = screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement;
    expect(botaoAnterior.disabled).toBe(true);
  });

  it("mudar a busca volta para a página 1 e refaz a consulta", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 2/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por código, cliente/), {
      target: { value: "0005" },
    });

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, busca: "0005" }),
      ),
    );
    await waitFor(() => expect(screen.getByText(/página 1 de 1/)).toBeTruthy());
  });

  it("trocar a ordenação envia ordenarPor/ordem ao backend e volta para a página 1", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 2/)).toBeTruthy());

    fireEvent.click(screen.getByRole("combobox", { name: "Ordenar vendas" }));
    fireEvent.click(screen.getByText("Maior valor"));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, ordenarPor: "valor", ordem: "desc" }),
      ),
    );
  });

  it("resposta vazia mostra o estado vazio, não uma grade em branco", async () => {
    listarMock.mockResolvedValueOnce({
      vendas: [],
      meta: { page: 1, limit: 12, total: 0, totalPages: 1 },
      facets: FACETS_VAZIOS,
    });

    renderPagina();

    await waitFor(() => expect(screen.getByText("Nenhuma venda encontrada")).toBeTruthy());
  });

  it("erro da API mostra o estado de erro com opção de tentar de novo", async () => {
    listarMock.mockRejectedValueOnce(new Error("Falha de conexão com o servidor."));

    renderPagina();

    await waitFor(() =>
      expect(screen.getByText(/não foi possível|erro|tentar novamente/i)).toBeTruthy(),
    );
  });

  it("indica atualização em segundo plano ao trocar de página, sem sumir com a lista atual", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy());

    let resolverPagina2!: (valor: ReturnType<typeof respostaPaginada>) => void;
    listarMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverPagina2 = resolve;
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    expect(screen.getByText("VENDA-2026-01-01-0001")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Atualizando…")).toBeTruthy());

    resolverPagina2(respostaPaginada({ page: 2, limit: 12 }));
    await waitFor(() => expect(screen.getByText("VENDA-2026-01-01-0013")).toBeTruthy());
  });
});
