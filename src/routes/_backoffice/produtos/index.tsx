import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PromocaoDialog } from "@/components/produtos/promocao-dialog";
import { ProdutoCard, ProdutoCardSkeleton } from "@/components/produtos/produto-card";
import { useExcluirProduto, useProdutos } from "@/hooks/use-produtos";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { useCampanhas, useColecoes, useFornecedores } from "@/hooks/use-cadastros";
import { mensagemDeErro } from "@/services/api/client";
import type {
  FiltroBooleano,
  FiltroDisponibilidade,
  OrdenarProdutoPor,
  Ordem,
  Produto,
  ProdutoFiltros,
} from "@/types/produto";

export const Route = createFileRoute("/_backoffice/produtos/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Produtos — MARIELA Backoffice" },
      {
        name: "description",
        content: "Catálogo visual de produtos com fotos, preços, promoções e estoque.",
      },
      { property: "og:title", content: "Produtos — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Catálogo visual de produtos com fotos, preços, promoções e estoque.",
      },
    ],
  }),
  component: ProdutosPage,
});

const TODOS = "todos";
const POR_PAGINA = 12;

type OrdenacaoValor =
  | "nome-asc"
  | "nome-desc"
  | "recentes"
  | "preco-desc"
  | "preco-asc"
  | "estoque-desc"
  | "estoque-asc";

const ORDENACOES: {
  valor: OrdenacaoValor;
  label: string;
  campo: OrdenarProdutoPor;
  ordem: Ordem;
}[] = [
  { valor: "nome-asc", label: "Nome A-Z", campo: "nome", ordem: "asc" },
  { valor: "nome-desc", label: "Nome Z-A", campo: "nome", ordem: "desc" },
  { valor: "recentes", label: "Mais recentes", campo: "criadoEm", ordem: "desc" },
  { valor: "preco-desc", label: "Maior preço", campo: "precoVenda", ordem: "desc" },
  { valor: "preco-asc", label: "Menor preço", campo: "precoVenda", ordem: "asc" },
  { valor: "estoque-desc", label: "Maior estoque", campo: "quantidadeTotal", ordem: "desc" },
  { valor: "estoque-asc", label: "Menor estoque", campo: "quantidadeTotal", ordem: "asc" },
];

function ProdutosPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(TODOS);
  const [colecaoId, setColecaoId] = useState(TODOS);
  const [campanhaId, setCampanhaId] = useState(TODOS);
  const [fornecedorId, setFornecedorId] = useState(TODOS);
  const [disponibilidade, setDisponibilidade] = useState<FiltroDisponibilidade>("todos");
  const [promocao, setPromocao] = useState<FiltroBooleano>("todos");
  const [novidade, setNovidade] = useState<FiltroBooleano>("todos");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoValor>("nome-asc");
  const [pagina, setPagina] = useState(1);

  const [produtoPromocao, setProdutoPromocao] = useState<Produto | null>(null);
  const [produtoExclusao, setProdutoExclusao] = useState<Produto | null>(null);

  const { data: configuracoes } = useConfiguracoes();
  const { data: colecoes } = useColecoes();
  const { data: campanhas } = useCampanhas();
  const { data: fornecedores } = useFornecedores();
  const excluir = useExcluirProduto();

  const filtros = useMemo<ProdutoFiltros>(() => {
    const opcao = ORDENACOES.find((item) => item.valor === ordenacao) ?? ORDENACOES[0]!;
    return {
      busca: busca || undefined,
      categoria: categoria === TODOS ? undefined : categoria,
      colecaoId: colecaoId === TODOS ? undefined : colecaoId,
      campanhaId: campanhaId === TODOS ? undefined : campanhaId,
      fornecedorId: fornecedorId === TODOS ? undefined : fornecedorId,
      disponibilidade,
      promocao,
      novidade,
      ordenarPor: opcao.campo,
      ordem: opcao.ordem,
    };
  }, [
    busca,
    categoria,
    colecaoId,
    campanhaId,
    fornecedorId,
    disponibilidade,
    promocao,
    novidade,
    ordenacao,
  ]);

  // Filtros/ordenação mudaram: volta para a primeira página.
  useEffect(() => {
    setPagina(1);
  }, [filtros]);

  const { data, isPending, isError, error, refetch, isFetching } = useProdutos(filtros);
  const produtos = data?.produtos ?? [];

  const total = produtos.length;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  // Recorte local por página; ao conectar a API real basta enviar page/limit.
  const visiveis = produtos.slice(inicio, inicio + POR_PAGINA);

  const temFiltros =
    Boolean(busca) ||
    categoria !== TODOS ||
    colecaoId !== TODOS ||
    campanhaId !== TODOS ||
    fornecedorId !== TODOS ||
    disponibilidade !== "todos" ||
    promocao !== "todos" ||
    novidade !== "todos";

  function limparFiltros() {
    setBusca("");
    setCategoria(TODOS);
    setColecaoId(TODOS);
    setCampanhaId(TODOS);
    setFornecedorId(TODOS);
    setDisponibilidade("todos");
    setPromocao("todos");
    setNovidade("todos");
  }

  async function confirmarExclusao() {
    if (!produtoExclusao) return;
    try {
      await excluir.mutateAsync(produtoExclusao.id);
      toast.success("Produto excluído com sucesso.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o produto."));
    } finally {
      setProdutoExclusao(null);
    }
  }

  return (
    <Page
      titulo="Produtos"
      breadcrumbs={[{ label: "Catálogo" }, { label: "Produtos" }]}
      descricao="Catálogo visual do acervo: fotos, preços vigentes, promoções e disponibilidade."
      acoes={
        <Button onClick={() => void navigate({ to: "/produtos/novo" })}>
          <Plus aria-hidden className="size-4" /> Novo produto
        </Button>
      }
    >
      <Card className="mb-6 border-border bg-surface/60">
        <CardContent className="space-y-3 py-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative lg:max-w-sm lg:flex-1">
              <Search
                aria-hidden
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Buscar por nome ou código"
                placeholder="Buscar por nome ou código…"
                className="pl-9"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>

            <div className="flex flex-1 items-center justify-end gap-2">
              <Select
                value={ordenacao}
                onValueChange={(valor) => setOrdenacao(valor as OrdenacaoValor)}
              >
                <SelectTrigger aria-label="Ordenar por" className="w-52">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  {ORDENACOES.map((opcao) => (
                    <SelectItem key={opcao.valor} value={opcao.valor}>
                      {opcao.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {temFiltros ? (
                <Button variant="ghost" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger aria-label="Filtrar por categoria">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as categorias</SelectItem>
                {(configuracoes?.categorias ?? []).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={colecaoId} onValueChange={setColecaoId}>
              <SelectTrigger aria-label="Filtrar por coleção">
                <SelectValue placeholder="Coleção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as coleções</SelectItem>
                {(colecoes ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={campanhaId} onValueChange={setCampanhaId}>
              <SelectTrigger aria-label="Filtrar por campanha">
                <SelectValue placeholder="Campanha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as campanhas</SelectItem>
                {(campanhas ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fornecedorId} onValueChange={setFornecedorId}>
              <SelectTrigger aria-label="Filtrar por fornecedor">
                <SelectValue placeholder="Fornecedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os fornecedores</SelectItem>
                {(fornecedores ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={disponibilidade}
              onValueChange={(valor) => setDisponibilidade(valor as FiltroDisponibilidade)}
            >
              <SelectTrigger aria-label="Filtrar por estoque">
                <SelectValue placeholder="Estoque" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Estoque: todos</SelectItem>
                <SelectItem value="disponivel">Em estoque</SelectItem>
                <SelectItem value="sem-estoque">Sem estoque</SelectItem>
              </SelectContent>
            </Select>

              <Select
                value={promocao}
                onValueChange={(valor) => setPromocao(valor as FiltroBooleano)}
              >
                <SelectTrigger aria-label="Filtrar por promoção">
                  <SelectValue placeholder="Promoção" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Promoção: todas</SelectItem>
                  <SelectItem value="sim">Em promoção</SelectItem>
                  <SelectItem value="nao">Sem promoção</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={novidade}
                onValueChange={(valor) => setNovidade(valor as FiltroBooleano)}
              >
                <SelectTrigger aria-label="Filtrar por novidade">
                  <SelectValue placeholder="Novidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Novidade: todas</SelectItem>
                  <SelectItem value="sim">Novidades</SelectItem>
                  <SelectItem value="nao">Não novidades</SelectItem>
                </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, indice) => (
            <ProdutoCardSkeleton key={indice} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          titulo="Nenhum produto encontrado"
          descricao={
            temFiltros
              ? "Não encontramos produtos para os filtros selecionados."
              : "Cadastre o primeiro produto do catálogo Mariela."
          }
          acao={
            temFiltros ? (
              <Button variant="outline" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            ) : (
              <Button onClick={() => void navigate({ to: "/produtos/novo" })}>Novo produto</Button>
            )
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visiveis.map((produto) => (
              <ProdutoCard
                key={produto.id}
                produto={produto}
                onExcluir={setProdutoExclusao}
                onPromocao={setProdutoPromocao}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3">
            <span className="font-brand text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              {total} produto(s) · página {paginaAtual} de {totalPaginas}
            </span>
            <div className="flex items-center gap-2">
              {isFetching ? <Badge variant="outline">Atualizando…</Badge> : null}
              <Button
                variant="outline"
                size="icon"
                aria-label="Página anterior"
                disabled={paginaAtual <= 1}
                onClick={() => setPagina(paginaAtual - 1)}
              >
                <ChevronLeft aria-hidden className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Próxima página"
                disabled={paginaAtual >= totalPaginas}
                onClick={() => setPagina(paginaAtual + 1)}
              >
                <ChevronRight aria-hidden className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {produtoPromocao ? (
        <PromocaoDialog
          produto={produtoPromocao}
          open={produtoPromocao !== null}
          onOpenChange={(aberto) => {
            if (!aberto) setProdutoPromocao(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={produtoExclusao !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setProdutoExclusao(null);
        }}
        titulo="Excluir produto"
        descricao={`Tem certeza que deseja excluir "${produtoExclusao?.nome ?? ""}"? Esta ação não pode ser desfeita.`}
        confirmarLabel="Excluir"
        onConfirm={() => void confirmarExclusao()}
      />
    </Page>
  );
}
