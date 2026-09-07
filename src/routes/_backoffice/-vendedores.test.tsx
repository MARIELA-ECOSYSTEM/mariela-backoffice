import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import type { Vendedor, VendedorFiltros } from "@/types/vendedor";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // `AppHeader` (dentro do layout `Page`) monta `AuthProvider`, que usa
    // `useRouter()` — sem isto, precisaria de um `RouterProvider` real.
    useRouter: () => ({ state: { location: { pathname: "/vendedores" } } }),
  };
});

function vendedor(overrides: Partial<Vendedor> & { id: string; nome: string }): Vendedor {
  return {
    codigo: `VEN-${overrides.id}`,
    foto: null,
    telefone: "11994441122",
    dataNascimento: null,
    observacao: "",
    ativo: true,
    criadoEm: "2026-01-01T00:00:00.000Z",
    atualizadoEm: "2026-01-01T00:00:00.000Z",
    vendas: 0,
    totalVendido: 0,
    ultimaVenda: null,
    ...overrides,
  };
}

/** Base de 30 vendedores — grande o bastante para exigir 3 páginas de 12 (POR_PAGINA da tela). */
const BASE = Array.from({ length: 30 }, (_, indice) =>
  vendedor({ id: String(indice + 1), nome: `Vendedor ${String(indice + 1).padStart(2, "0")}` }),
);

const listarMock = vi.fn();
vi.mock("@/services/api/vendedores.api", () => ({
  PAGINA_PADRAO_VENDEDORES: 1,
  LIMITE_PADRAO_VENDEDORES: 20,
  LIMITE_MAXIMO_VENDEDORES: 100,
  vendedoresApi: {
    listar: listarMock,
    obter: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    alterarStatus: vi.fn(),
    redefinirSenha: vi.fn(),
    listarVendas: vi.fn().mockResolvedValue([]),
    remover: vi.fn(),
  },
}));

const FACETS_VAZIOS = {
  status: [],
  vendas: [],
  valor: [],
  ultimaVenda: [],
  nascimento: [],
  observacao: [],
};

/** Simula o backend real: filtra por busca (nome/código/telefone) e fatia por page/limit. */
function respostaPaginada(filtros: VendedorFiltros) {
  const termo = filtros.busca?.trim().toLowerCase();
  const filtrados = termo
    ? BASE.filter(
        (item) =>
          item.nome.toLowerCase().includes(termo) ||
          item.codigo.toLowerCase().includes(termo) ||
          item.telefone.toLowerCase().includes(termo),
      )
    : BASE;
  const page = filtros.page ?? 1;
  const limit = filtros.limit ?? 12;
  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = (page - 1) * limit;
  return {
    vendedores: filtrados.slice(inicio, inicio + limit),
    meta: { page, limit, total, totalPages },
    facets: FACETS_VAZIOS,
  };
}

const { Route } = await import("./vendedores");
const VendedoresPage = Route.options.component!;

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VendedoresPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Tela de Vendedores — paginação e filtros server-side", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    listarMock.mockImplementation(async (filtros: VendedorFiltros = {}) =>
      respostaPaginada(filtros),
    );
  });

  it("carrega a primeira página com page=1 e limit=12 (POR_PAGINA da tela) por padrão", async () => {
    renderPagina();

    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());
    expect(listarMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 12 }));
    expect(screen.getByText(/30 vendedor\(as\) encontrada\(s\)/)).toBeTruthy();
    expect(screen.getByText(/página 1 de 3/)).toBeTruthy();
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
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());
  });

  it("próxima página: chama a API com page=2 e mostra os itens seguintes", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    await waitFor(() => expect(screen.getByText("Vendedor 13")).toBeTruthy());
    expect(screen.getByText(/página 2 de 3/)).toBeTruthy();
    expect(screen.queryByText("Vendedor 01")).toBeNull();
  });

  it("página anterior: volta para page=1 a partir da page=2", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })),
    );
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());
  });

  it("bloqueia avançar além da última página", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 3 de 3/)).toBeTruthy());

    const botaoProxima = screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement;
    expect(botaoProxima.disabled).toBe(true);
  });

  it("bloqueia voltar antes da primeira página", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());
    const botaoAnterior = screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement;
    expect(botaoAnterior.disabled).toBe(true);
  });

  it("mudar a busca volta para a página 1 e refaz a consulta", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome, código ou telefone/), {
      target: { value: "Vendedor 05" },
    });

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, busca: "Vendedor 05" }),
      ),
    );
    await waitFor(() => expect(screen.getByText(/página 1 de 1/)).toBeTruthy());
  });

  it("trocar a ordenação envia ordenarPor/ordem ao backend e volta para a página 1", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.click(screen.getByRole("combobox", { name: "Ordenar vendedores" }));
    fireEvent.click(screen.getByText("Mais vendas"));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, ordenarPor: "vendas", ordem: "desc" }),
      ),
    );
  });

  it("resposta vazia mostra o estado vazio, não uma grade em branco", async () => {
    listarMock.mockResolvedValueOnce({
      vendedores: [],
      meta: { page: 1, limit: 12, total: 0, totalPages: 1 },
      facets: FACETS_VAZIOS,
    });

    renderPagina();

    await waitFor(() => expect(screen.getByText("Nenhum vendedor encontrado")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("Vendedor 01")).toBeTruthy());

    let resolverPagina2!: (valor: ReturnType<typeof respostaPaginada>) => void;
    listarMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverPagina2 = resolve;
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    // Com `placeholderData: keepPreviousData`, a página 1 continua visível
    // (não volta pro skeleton) enquanto a página 2 ainda está a caminho.
    expect(screen.getByText("Vendedor 01")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Atualizando…")).toBeTruthy());

    resolverPagina2(respostaPaginada({ page: 2, limit: 12 }));
    await waitFor(() => expect(screen.getByText("Vendedor 13")).toBeTruthy());
  });
});
