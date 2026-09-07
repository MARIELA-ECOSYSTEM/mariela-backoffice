import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import type { Fornecedor, FornecedorFiltros } from "@/types/fornecedor";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // `AppHeader` (dentro do layout `Page`) monta `AuthProvider`, que usa
    // `useRouter()` — sem isto, precisaria de um `RouterProvider` real.
    useRouter: () => ({ state: { location: { pathname: "/fornecedores" } } }),
  };
});

function fornecedor(overrides: Partial<Fornecedor> & { id: string; nome: string }): Fornecedor {
  return {
    codigo: `FOR-${overrides.id}`,
    foto: null,
    contato: "",
    telefone: "",
    email: "",
    cnpj: "",
    instagram: "",
    observacao: "",
    endereco: null,
    criadoEm: "2026-01-01T00:00:00.000Z",
    atualizadoEm: "2026-01-01T00:00:00.000Z",
    produtosVinculados: 0,
    valorEmCusto: 0,
    ultimaEntrada: null,
    ...overrides,
  };
}

/** Base de 30 fornecedores — grande o bastante para exigir 3 páginas de 12 (POR_PAGINA da tela). */
const BASE = Array.from({ length: 30 }, (_, indice) =>
  fornecedor({ id: String(indice + 1), nome: `Fornecedor ${String(indice + 1).padStart(2, "0")}` }),
);

const listarMock = vi.fn();
vi.mock("@/services/api/cadastros.api", () => ({
  PAGINA_PADRAO_FORNECEDORES: 1,
  LIMITE_PADRAO_FORNECEDORES: 20,
  LIMITE_MAXIMO_FORNECEDORES: 100,
  fornecedoresApi: {
    listar: listarMock,
    criar: vi.fn(),
    atualizar: vi.fn(),
    remover: vi.fn(),
    listarHistorico: vi.fn().mockResolvedValue([]),
  },
  clientesApi: { listar: vi.fn().mockResolvedValue({ clientes: [], meta: {}, facets: {} }) },
  colecoesApi: { listar: vi.fn().mockResolvedValue([]) },
  campanhasApi: { listar: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/api/whatsapp.api", () => ({
  whatsappApi: { enviarMensagem: vi.fn().mockResolvedValue({ status: "simulado" }) },
}));

const FACETS_VAZIOS = { produtos: [], endereco: [], entrada: [], documento: [] };

/** Simula o backend real: filtra por busca (nome/código/contato/telefone/cnpj) e fatia por page/limit. */
function respostaPaginada(filtros: FornecedorFiltros) {
  const termo = filtros.busca?.trim().toLowerCase();
  const filtrados = termo ? BASE.filter((item) => item.nome.toLowerCase().includes(termo)) : BASE;
  const page = filtros.page ?? 1;
  const limit = filtros.limit ?? 12;
  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = (page - 1) * limit;
  return {
    fornecedores: filtrados.slice(inicio, inicio + limit),
    meta: { page, limit, total, totalPages },
    facets: FACETS_VAZIOS,
  };
}

const { Route } = await import("./fornecedores");
const FornecedoresPage = Route.options.component!;

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FornecedoresPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Tela de Fornecedores — paginação e filtros server-side", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    listarMock.mockImplementation(async (filtros: FornecedorFiltros = {}) =>
      respostaPaginada(filtros),
    );
  });

  it("carrega a primeira página com page=1 e limit=12 (POR_PAGINA da tela) por padrão", async () => {
    renderPagina();

    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());
    expect(listarMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 12 }));
    expect(screen.getByText(/30 fornecedor\(es\) encontrado\(s\)/)).toBeTruthy();
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
    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());
  });

  it("próxima página: chama a API com page=2 e mostra os itens seguintes", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    await waitFor(() => expect(screen.getByText("Fornecedor 13")).toBeTruthy());
    expect(screen.getByText(/página 2 de 3/)).toBeTruthy();
    expect(screen.queryByText("Fornecedor 01")).toBeNull();
  });

  it("página anterior: volta para page=1 a partir da page=2", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })),
    );
    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());
  });

  it("bloqueia avançar além da última página", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 3 de 3/)).toBeTruthy());

    const botaoProxima = screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement;
    expect(botaoProxima.disabled).toBe(true);
  });

  it("bloqueia voltar antes da primeira página", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());
    const botaoAnterior = screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement;
    expect(botaoAnterior.disabled).toBe(true);
  });

  it("mudar a busca volta para a página 1 e refaz a consulta", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome, código/), {
      target: { value: "Fornecedor 05" },
    });

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, busca: "Fornecedor 05" }),
      ),
    );
    await waitFor(() => expect(screen.getByText(/página 1 de 1/)).toBeTruthy());
  });

  it("resposta vazia mostra o estado vazio, não uma grade em branco", async () => {
    listarMock.mockResolvedValueOnce({
      fornecedores: [],
      meta: { page: 1, limit: 12, total: 0, totalPages: 1 },
      facets: FACETS_VAZIOS,
    });

    renderPagina();

    await waitFor(() => expect(screen.getByText("Nenhum fornecedor encontrado")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("Fornecedor 01")).toBeTruthy());

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
    expect(screen.getByText("Fornecedor 01")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Atualizando…")).toBeTruthy());

    resolverPagina2(respostaPaginada({ page: 2, limit: 12 }));
    await waitFor(() => expect(screen.getByText("Fornecedor 13")).toBeTruthy());
  });
});
