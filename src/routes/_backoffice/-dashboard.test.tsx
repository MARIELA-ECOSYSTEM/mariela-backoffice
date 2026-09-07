import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import type { ResumoDashboard } from "@/types/dashboard";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // `dashboard.tsx` usa `Link` só para "Novo produto"/"Ver todas" — um link
    // burro evita montar toda a árvore de rotas (este teste é sobre os dados
    // do resumo, não sobre navegação).
    Link: ({ children, to, ...props }: { children?: ReactNode; to?: string; [chave: string]: unknown }) => (
      <a href={typeof to === "string" ? to : "#"} {...props}>
        {children}
      </a>
    ),
  };
});

const resumoMock = vi.fn();
vi.mock("@/services/api/dashboard.api", () => ({
  dashboardApi: { resumo: (...args: unknown[]) => resumoMock(...args) },
}));

const { Route } = await import("./dashboard");
const DashboardPage = Route.options.component!;

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function resumoBase(overrides: Partial<ResumoDashboard> = {}): ResumoDashboard {
  return {
    demonstracao: false,
    geradoEm: "2026-08-20T12:00:00.000Z",
    vendas: {
      mesReferencia: "2026-08",
      mesLabel: "agosto de 2026",
      mesesDisponiveis: [
        { valor: "2026-08", label: "agosto de 2026" },
        { valor: "2026-07", label: "julho de 2026" },
      ],
      vendasHoje: 2,
      faturamentoHoje: 400,
      vendasSemana: 5,
      faturamentoSemana: 900,
      vendasMes: 10,
      faturamentoMes: 2000,
      ticketMedioMes: 200,
      vendasMesAnterior: 8,
      faturamentoMesAnterior: 1600,
      crescimentoMensalPercentual: 25,
      evolucao: [
        { data: "2026-08-01", label: "01/08", vendas: 2, faturamento: 400 },
        { data: "2026-08-02", label: "02/08", vendas: 0, faturamento: 0 },
      ],
      ultimasVendas: [
        {
          id: "venda-1",
          codigo: "VENDA-2026-08-20-0001",
          numero: "000001",
          dataVenda: "2026-08-20T12:00:00.000Z",
          clienteId: "cli-1",
          clienteNome: "Cliente Teste",
          vendedorId: "ven-1",
          vendedorNome: "Vendedora Teste",
          caixaId: "cx-1",
          caixaCodigo: "CAIXA-0001",
          totalItens: 1,
          valorBruto: 200,
          descontoPromocional: 0,
          descontoVenda: 0,
          descontoTotal: 0,
          valorFinal: 200,
          valorPago: 200,
          valorPendente: 0,
          valorDevolvido: 0,
          temPromocao: false,
          temDesconto: false,
          formaPagamento: "Dinheiro",
          totalParcelas: 1,
          parcelasPagas: 1,
          status: "concluida",
        },
      ],
      ...overrides.vendas,
    },
    estoque: {
      produtosCadastrados: 12,
      variantesCadastradas: 30,
      pecasEmEstoque: 150,
      produtosSemEstoque: 1,
      custoEstoque: 5000,
      vendaPotencial: 12000,
      lucroPotencial: 7000,
      margemMediaPercentual: 58.33,
      ticketMedioEstoque: 80,
      ...overrides.estoque,
    },
    clientes: {
      cadastrados: 40,
      ativos: 40,
      inativos: 0,
      novosNoMes: 3,
      compraramNoMes: 7,
      ticketMedioPorCliente: 285.71,
      recentes: [
        { id: "cli-1", nome: "Cliente Teste", foto: null, detalhe: "(11) 99999-9999", ativo: true, criadoEm: "2026-08-15T00:00:00.000Z" },
      ],
      ...overrides.clientes,
    },
    fornecedores: {
      cadastrados: 5,
      ativos: 4,
      inativos: 1,
      recentes: [{ id: "for-1", nome: "Fornecedor Teste", foto: null, detalhe: "3 produtos", ativo: true, criadoEm: "2026-08-10T00:00:00.000Z" }],
      ...overrides.fornecedores,
    },
    vendedores: {
      cadastrados: 3,
      ativos: 2,
      inativos: 1,
      ranking: [
        { vendedorId: "ven-1", nome: "Vendedora Teste", foto: null, vendas: 6, faturamento: 1200, ticketMedio: 200 },
        { vendedorId: "ven-2", nome: "Vendedora Dois", foto: null, vendas: 4, faturamento: 800, ticketMedio: 200 },
      ],
      ...overrides.vendedores,
    },
    ...overrides,
  };
}

describe("Tela de Dashboard — indicadores calculados pelo backend", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    resumoMock.mockResolvedValue(resumoBase());
  });

  it("mostra o skeleton enquanto o resumo carrega", async () => {
    let resolver!: (valor: ResumoDashboard) => void;
    resumoMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );

    const { container } = renderPagina();
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);

    resolver(resumoBase());
    await waitFor(() => expect(screen.getByText("Faturamento · agosto de 2026")).toBeTruthy());
  });

  it("renderiza faturamento, vendas do mês e ticket médio calculados pelo backend, sem recomputar nada", async () => {
    renderPagina();

    await waitFor(() => expect(screen.getByText("Faturamento · agosto de 2026")).toBeTruthy());
    expect(resumoMock).toHaveBeenCalledWith(undefined);
    expect(screen.getAllByText(/R\$\s?2\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ticket médio.*R\$\s?200,00/)).toBeTruthy();
  });

  it("mostra a evolução de vendas e a lista de últimas vendas vindas prontas do backend", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Evolução de vendas")).toBeTruthy());
    expect(screen.getByText("Últimas vendas")).toBeTruthy();
    expect(screen.getByText("#000001")).toBeTruthy();
    expect(screen.getAllByText("Cliente Teste").length).toBeGreaterThan(0);
  });

  it("mostra o ranking de vendedoras ordenado por faturamento, como veio do backend", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Ranking de vendedoras")).toBeTruthy());
    const nomes = screen.getAllByText(/Vendedora (Teste|Dois)/).map((el) => el.textContent);
    expect(nomes.indexOf("Vendedora Teste")).toBeLessThan(nomes.indexOf("Vendedora Dois"));
  });

  it("estado vazio: sem vendas, sem clientes recentes e sem ranking mostra as mensagens de vazio, nunca R$ 0,00 disfarçado", async () => {
    resumoMock.mockResolvedValue(
      resumoBase({
        vendas: { ...resumoBase().vendas, vendasMes: 0, faturamentoMes: 0, evolucao: [{ data: "2026-08-01", label: "01/08", vendas: 0, faturamento: 0 }], ultimasVendas: [] },
        clientes: { ...resumoBase().clientes, recentes: [] },
        fornecedores: { ...resumoBase().fornecedores, recentes: [] },
        vendedores: { ...resumoBase().vendedores, ranking: [] },
      }),
    );

    renderPagina();

    await waitFor(() => expect(screen.getByText("Nenhuma venda registrada.")).toBeTruthy());
    expect(screen.getByText("Nenhuma venda registrada no período.")).toBeTruthy();
    expect(screen.getByText("Nenhuma cliente cadastrada.")).toBeTruthy();
    expect(screen.getByText("Nenhum fornecedor cadastrado.")).toBeTruthy();
    expect(screen.getByText("Nenhuma venda atribuída no período.")).toBeTruthy();
  });

  it("erro da API mostra o estado de erro com opção de tentar de novo, e o retry refaz a busca", async () => {
    resumoMock.mockRejectedValueOnce(new Error("Falha de conexão com o servidor."));

    renderPagina();

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("Algo deu errado")).toBeTruthy();

    resumoMock.mockResolvedValueOnce(resumoBase());
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByText("Faturamento · agosto de 2026")).toBeTruthy());
    expect(resumoMock).toHaveBeenCalledTimes(2);
  });

  it("mostra o aviso de dados de demonstração só quando `demonstracao` vem true", async () => {
    resumoMock.mockResolvedValueOnce(resumoBase({ demonstracao: true }));
    renderPagina();
    await waitFor(() => expect(screen.getByText(/MARIELA PDV/)).toBeTruthy());
  });

  it("não mostra o aviso de demonstração quando os dados são reais", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Faturamento · agosto de 2026")).toBeTruthy());
    expect(screen.queryByText(/MARIELA PDV/)).toBeNull();
  });

  it("trocar o mês de referência chama a API com o novo mês (nunca filtra no frontend)", async () => {
    renderPagina();
    await waitFor(() => expect(screen.getByText("Faturamento · agosto de 2026")).toBeTruthy());

    resumoMock.mockResolvedValueOnce(
      resumoBase({ vendas: { ...resumoBase().vendas, mesReferencia: "2026-07", mesLabel: "julho de 2026", faturamentoMes: 1600 } }),
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Mês de referência" }));
    fireEvent.click(screen.getByText("julho de 2026"));

    await waitFor(() => expect(resumoMock).toHaveBeenLastCalledWith("2026-07"));
    await waitFor(() => expect(screen.getByText("Faturamento · julho de 2026")).toBeTruthy());
  });
});
