import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import type { Caixa, CaixaFiltros } from "@/types/caixa";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouter: () => ({ state: { location: { pathname: "/caixa" } } }),
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

function resumoVazio(valorAbertura: number): Caixa["resumo"] {
  return {
    valorAbertura,
    totalVendas: 0,
    recebimentos: 0,
    entradasManuais: 0,
    totalEntradas: 0,
    saidasManuais: 0,
    devolucoes: 0,
    totalSaidas: 0,
    saldoEsperado: valorAbertura,
    quantidadeVendas: 0,
    quantidadeMovimentacoes: 0,
  };
}

function caixa(overrides: Partial<Caixa> & { id: string; codigo: string }): Caixa {
  return {
    status: "fechado",
    abertura: {
      dataHora: "2026-01-01T09:00:00.000Z",
      responsavelId: null,
      responsavelNome: "Backoffice",
      valorInicial: 100,
      observacao: "",
    },
    fechamento: null,
    resumo: resumoVazio(100),
    ...overrides,
  };
}

/** Base de 20 caixas — mais que a `POR_PAGINA` da tela (9), exigindo mais de uma página. */
const BASE = Array.from({ length: 20 }, (_, indice) =>
  caixa({ id: String(indice + 1), codigo: `CAIXA-${String(indice + 1).padStart(4, "0")}` }),
);

const listarMock = vi.fn();
const atualMock = vi.fn();
const estatisticasMock = vi.fn();
vi.mock("@/services/api/caixas.api", () => ({
  PAGINA_PADRAO_CAIXAS: 1,
  LIMITE_PADRAO_CAIXAS: 20,
  LIMITE_MAXIMO_CAIXAS: 100,
  caixasApi: {
    listar: listarMock,
    atual: atualMock,
    estatisticas: estatisticasMock,
    obter: vi.fn(),
    movimentacoes: vi.fn().mockResolvedValue({
      movimentacoes: [],
      meta: { page: 1, limit: 50, total: 0, totalPages: 1 },
    }),
    vendas: vi.fn().mockResolvedValue([]),
    recebimentos: vi.fn().mockResolvedValue([]),
    abrir: vi.fn(),
    entrada: vi.fn(),
    saida: vi.fn(),
    fechar: vi.fn(),
  },
}));

const FACETS_VAZIOS = { status: [], periodo: [], responsavel: [], diferenca: [], saldo: [] };

/** Simula o backend real: filtra por busca (código/responsável) e fatia por page/limit. */
function respostaPaginada(filtros: CaixaFiltros) {
  const termo = filtros.busca?.trim().toLowerCase();
  const filtrados = termo ? BASE.filter((item) => item.codigo.toLowerCase().includes(termo)) : BASE;
  const page = filtros.page ?? 1;
  const limit = filtros.limit ?? 9;
  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = (page - 1) * limit;
  return {
    caixas: filtrados.slice(inicio, inicio + limit),
    meta: { page, limit, total, totalPages },
    facets: FACETS_VAZIOS,
  };
}

const { Route } = await import("./caixa.index");
const CaixaPage = Route.options.component!;

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CaixaPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Tela de Caixa — paginação e filtros server-side", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    listarMock.mockImplementation(async (filtros: CaixaFiltros = {}) => respostaPaginada(filtros));
    atualMock.mockResolvedValue(null);
    estatisticasMock.mockResolvedValue({
      caixasAbertos: 0,
      caixasFechados: 20,
      entradasHoje: 0,
      saidasHoje: 0,
      vendasHoje: 0,
      recebimentosHoje: 0,
      devolucoesHoje: 0,
      saldoEsperadoAtual: 0,
      diferencaAcumulada: 0,
    });
  });

  it("carrega a primeira página com page=1 e limit=9 (POR_PAGINA da tela) por padrão", async () => {
    renderPagina();

    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());
    expect(listarMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 9 }));
    expect(screen.getByText(/20 caixa\(s\) encontrado\(s\)/)).toBeTruthy();
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

    resolver(respostaPaginada({ page: 1, limit: 9 }));
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());
  });

  it("próxima página: chama a API com page=2 e mostra os itens seguintes", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    await waitFor(() => expect(screen.getByText("CAIXA-0010")).toBeTruthy());
    expect(screen.getByText(/página 2 de 3/)).toBeTruthy();
    expect(screen.queryByText("CAIXA-0001")).toBeNull();
  });

  it("página anterior: volta para page=1 a partir da page=2", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })),
    );
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());
  });

  it("bloqueia avançar além da última página", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 3 de 3/)).toBeTruthy());

    const botaoProxima = screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement;
    expect(botaoProxima.disabled).toBe(true);
  });

  it("bloqueia voltar antes da primeira página", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());
    const botaoAnterior = screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement;
    expect(botaoAnterior.disabled).toBe(true);
  });

  it("mudar a busca volta para a página 1 e refaz a consulta", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por código do caixa/), {
      target: { value: "CAIXA-0005" },
    });

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, busca: "CAIXA-0005" }),
      ),
    );
    await waitFor(() => expect(screen.getByText(/página 1 de 1/)).toBeTruthy());
  });

  it("trocar a ordenação envia ordenarPor/ordem ao backend e volta para a página 1", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.click(screen.getByRole("combobox", { name: "Ordenar caixas" }));
    fireEvent.click(screen.getByText("Maior saldo"));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, ordenarPor: "saldo", ordem: "desc" }),
      ),
    );
  });

  it("resposta vazia mostra o estado vazio, não uma grade em branco", async () => {
    listarMock.mockResolvedValueOnce({
      caixas: [],
      meta: { page: 1, limit: 9, total: 0, totalPages: 1 },
      facets: FACETS_VAZIOS,
    });

    renderPagina();

    await waitFor(() => expect(screen.getByText("Nenhum caixa encontrado")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("CAIXA-0001")).toBeTruthy());

    let resolverPagina2!: (valor: ReturnType<typeof respostaPaginada>) => void;
    listarMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverPagina2 = resolve;
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    expect(screen.getByText("CAIXA-0001")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Atualizando…")).toBeTruthy());

    resolverPagina2(respostaPaginada({ page: 2, limit: 9 }));
    await waitFor(() => expect(screen.getByText("CAIXA-0010")).toBeTruthy());
  });
});
