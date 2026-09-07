import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import type { Produto, ProdutoFiltros } from "@/types/produto";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    // `AppHeader` (dentro do layout `Page`) monta `AuthProvider`, que usa
    // `useRouter()` — sem isto, precisaria de um `RouterProvider` real.
    useRouter: () => ({ state: { location: { pathname: "/produtos" } } }),
    // `Link` real exige um RouterProvider de verdade (resolve rotas/hrefs);
    // como este teste é sobre paginação/filtros, não sobre navegação, um
    // link burro evita montar toda a árvore de rotas só para o `ProdutoCard`
    // conseguir renderizar seus links de "Editar"/"Abrir"/etc.
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

function produto(overrides: Partial<Produto> & { id: string; nome: string }): Produto {
  return {
    codProduto: `PROD-${overrides.id}`,
    categoria: "Vestidos",
    precoCusto: 50,
    margemLucro: 50,
    precoVenda: 100,
    ehNovidade: false,
    ehPromocao: false,
    quantidadeTotal: 5,
    variantes: [],
    criadoEm: "2026-01-01T00:00:00.000Z",
    atualizadoEm: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Base de 45 produtos — grande o bastante para exigir 3 páginas de 20. */
const BASE = Array.from({ length: 45 }, (_, indice) =>
  produto({ id: String(indice + 1), nome: `Produto ${String(indice + 1).padStart(2, "0")}` }),
);

const listarMock = vi.fn();
const excluirMock = vi.fn();
vi.mock("@/services/api/produtos.api", () => ({
  PAGINA_PADRAO_PRODUTOS: 1,
  LIMITE_PADRAO_PRODUTOS: 20,
  produtosApi: {
    listar: listarMock,
    excluir: excluirMock,
    obter: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    definirFotoPrincipal: vi.fn(),
    definirNovidade: vi.fn(),
    definirPromocao: vi.fn(),
  },
}));

vi.mock("@/services/api/cadastros.api", () => ({
  LIMITE_MAXIMO_FORNECEDORES: 100,
  LIMITE_MAXIMO_CLIENTES: 100,
  LIMITE_MAXIMO_COLECOES: 100,
  LIMITE_MAXIMO_CAMPANHAS: 100,
  campanhasApi: {
    listar: vi.fn().mockResolvedValue({ campanhas: [], meta: {}, facets: {} }),
  },
  colecoesApi: {
    listar: vi.fn().mockResolvedValue({ colecoes: [], meta: {}, facets: {} }),
  },
  fornecedoresApi: {
    listar: vi.fn().mockResolvedValue({ fornecedores: [], meta: {}, facets: {} }),
  },
  clientesApi: { listar: vi.fn().mockResolvedValue({ clientes: [], meta: {}, facets: {} }) },
}));

vi.mock("@/services/api/configuracoes.api", () => ({
  configuracoesApi: {
    obter: vi
      .fn()
      .mockResolvedValue({ categorias: [], tamanhos: [], cores: [], formasPagamento: [] }),
  },
}));

/** Simula o backend real: filtra por busca, ordena, e fatia por page/limit. */
function respostaPaginada(filtros: ProdutoFiltros) {
  const termo = filtros.busca?.trim().toLowerCase();
  const filtrados = termo ? BASE.filter((item) => item.nome.toLowerCase().includes(termo)) : BASE;
  const page = filtros.page ?? 1;
  const limit = filtros.limit ?? 20;
  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const inicio = (page - 1) * limit;
  return {
    produtos: filtrados.slice(inicio, inicio + limit),
    meta: { page, limit, total, totalPages },
    facets: {
      categorias: [],
      colecoes: [],
      campanhas: [],
      fornecedores: [],
      estoque: [],
      promocao: [],
      novidade: [],
    },
  };
}

const { Route } = await import("./index");
const ProdutosPage = Route.options.component!;

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProdutosPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

/**
 * O nome do produto aparece DUAS vezes no card (um link-capa com
 * `sr-only` para acessibilidade + o título visível) — `findByText`/`getByText`
 * simples são ambíguos aqui de propósito. Estes helpers checam só PRESENÇA.
 */
async function produtoApareceu(nome: string): Promise<void> {
  await waitFor(() => expect(screen.getAllByText(nome).length).toBeGreaterThan(0));
}
function produtoNaoAparece(nome: string): boolean {
  return screen.queryAllByText(nome).length === 0;
}

describe("Tela de Produtos — paginação e filtros server-side", () => {
  // `vitest.config.ts` usa `globals: false` de propósito (ver comentário lá) —
  // por isso o auto-cleanup do Testing Library (que depende de um `afterEach`
  // global) nunca dispara sozinho aqui. Sem isto, cada `renderPagina()` deste
  // arquivo (o único no projeto que chama `render()` mais de uma vez) deixaria
  // o DOM do teste anterior montado, duplicando elementos como "Próxima página".
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    listarMock.mockImplementation(async (filtros: ProdutoFiltros = {}) =>
      respostaPaginada(filtros),
    );
  });

  it("carrega a primeira página com page=1 e limit=20 por padrão", async () => {
    renderPagina();

    await produtoApareceu("Produto 01");
    expect(listarMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
    expect(screen.getByText(/45 produto\(s\) encontrado\(s\)/)).toBeTruthy();
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

    resolver(respostaPaginada({ page: 1, limit: 20 }));
    await produtoApareceu("Produto 01");
  });

  it("próxima página: chama a API com page=2 e mostra os itens seguintes", async () => {
    renderPagina();
    await produtoApareceu("Produto 01");

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    await produtoApareceu("Produto 21");
    expect(screen.getByText(/página 2 de 3/)).toBeTruthy();
    expect(produtoNaoAparece("Produto 01")).toBe(true);
  });

  it("página anterior: volta para page=1 a partir da page=2", async () => {
    renderPagina();
    await produtoApareceu("Produto 01");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })),
    );
    await produtoApareceu("Produto 01");
  });

  it("bloqueia avançar além da última página", async () => {
    renderPagina();
    await produtoApareceu("Produto 01");

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(screen.getByText(/página 3 de 3/)).toBeTruthy());

    const botaoProxima = screen.getByRole("button", {
      name: "Próxima página",
    }) as HTMLButtonElement;
    expect(botaoProxima.disabled).toBe(true);
  });

  it("bloqueia voltar antes da primeira página", async () => {
    renderPagina();
    await produtoApareceu("Produto 01");
    const botaoAnterior = screen.getByRole("button", {
      name: "Página anterior",
    }) as HTMLButtonElement;
    expect(botaoAnterior.disabled).toBe(true);
  });

  it("mudar a busca volta para a página 1 e refaz a consulta", async () => {
    renderPagina();
    await produtoApareceu("Produto 01");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(screen.getByText(/página 2 de 3/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/Buscar por código/), {
      target: { value: "Produto 05" },
    });

    await waitFor(() =>
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, busca: "Produto 05" }),
      ),
    );
    await waitFor(() => expect(screen.getByText(/página 1 de 1/)).toBeTruthy());
  });

  it("resposta vazia mostra o estado vazio, não uma tabela em branco", async () => {
    listarMock.mockResolvedValueOnce({
      produtos: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      facets: {},
    });

    renderPagina();

    await waitFor(() => expect(screen.getByText("Nenhum produto encontrado")).toBeTruthy());
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
    await produtoApareceu("Produto 01");

    let resolverPagina2!: (valor: ReturnType<typeof respostaPaginada>) => void;
    listarMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverPagina2 = resolve;
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    // Com `placeholderData: keepPreviousData`, a página 1 continua visível
    // (não volta pro skeleton) enquanto a página 2 ainda está a caminho.
    expect(screen.getAllByText("Produto 01").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("Atualizando…")).toBeTruthy());

    resolverPagina2(respostaPaginada({ page: 2, limit: 20 }));
    await produtoApareceu("Produto 21");
  });
});
