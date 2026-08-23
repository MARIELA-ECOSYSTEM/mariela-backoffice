import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { PromocaoDialog } from "@/components/produtos/promocao-dialog";
import { ProdutoCard, ProdutoCardSkeleton } from "@/components/produtos/produto-card";
import { useExcluirProduto, useProdutos } from "@/hooks/use-produtos";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { useCampanhas, useColecoes, useFornecedores } from "@/hooks/use-cadastros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import {
  opcoesDe,
  opcoesDeValores,
  type GrupoFacetaDef,
  type SelecaoFacetas,
} from "@/lib/filtros/facetas";
import {
  COM_ESTOQUE,
  EH_NOVIDADE,
  EM_PROMOCAO,
  FACETAS_PRODUTO,
  SEM_ESTOQUE,
  SEM_NOVIDADE,
  SEM_PROMOCAO,
} from "@/lib/filtros/produtos-facetas";
import { mensagemDeErro } from "@/services/api/client";
import type { OrdenarProdutoPor, Ordem, Produto, ProdutoFiltros } from "@/types/produto";

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

const POR_PAGINA = 20;

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
  const [ordenacao, setOrdenacao] = useState<OrdenacaoValor>("nome-asc");
  const [pagina, setPagina] = useState(1);

  const [produtoPromocao, setProdutoPromocao] = useState<Produto | null>(null);
  const [produtoExclusao, setProdutoExclusao] = useState<Produto | null>(null);

  const { data: configuracoes } = useConfiguracoes();
  const { data: colecoes } = useColecoes();
  const { data: campanhas } = useCampanhas();
  const { data: fornecedores } = useFornecedores();
  const excluir = useExcluirProduto();

  // Seleção das facetas é enviada à camada de dados: os counts NÃO são
  // calculados sobre a página atual, e sim devolvidos em `facets`.
  const [selecao, setSelecao] = useState<SelecaoFacetas>({});

  const filtros = useMemo<ProdutoFiltros>(() => {
    const opcao = ORDENACOES.find((item) => item.valor === ordenacao) ?? ORDENACOES[0]!;
    return {
      busca: busca || undefined,
      ordenarPor: opcao.campo,
      ordem: opcao.ordem,
      facetas: selecao,
    };
  }, [busca, ordenacao, selecao]);

  const { data, isPending, isError, error, refetch, isFetching } = useProdutos(filtros);
  const produtos = useMemo(() => data?.produtos ?? [], [data?.produtos]);

  const grupos = useMemo<GrupoFacetaDef<Produto>[]>(
    () => [
      {
        id: FACETAS_PRODUTO.categorias,
        label: "Categoria",
        opcoes: opcoesDeValores(configuracoes?.categorias),
        corresponde: (produto, valor) => produto.categoria === valor,
        placeholderBusca: "Buscar categoria…",
      },
      {
        id: FACETAS_PRODUTO.colecoes,
        label: "Coleção",
        opcoes: opcoesDe(colecoes),
        corresponde: (produto, valor) => produto.colecaoId === valor,
        placeholderBusca: "Buscar coleção…",
      },
      {
        id: FACETAS_PRODUTO.campanhas,
        label: "Campanha",
        opcoes: opcoesDe(campanhas),
        corresponde: (produto, valor) => produto.campanhaId === valor,
        placeholderBusca: "Buscar campanha…",
      },
      {
        id: FACETAS_PRODUTO.fornecedores,
        label: "Fornecedor",
        opcoes: opcoesDe(fornecedores),
        corresponde: (produto, valor) => produto.fornecedorId === valor,
        placeholderBusca: "Buscar fornecedor…",
      },
      {
        id: FACETAS_PRODUTO.estoque,
        label: "Estoque",
        opcoes: [
          { valor: COM_ESTOQUE, label: "Com estoque" },
          { valor: SEM_ESTOQUE, label: "Sem estoque" },
        ],
        corresponde: (produto, valor) =>
          valor === COM_ESTOQUE ? produto.quantidadeTotal > 0 : produto.quantidadeTotal === 0,
      },
      {
        id: FACETAS_PRODUTO.promocao,
        label: "Promoção",
        opcoes: [
          { valor: EM_PROMOCAO, label: "Em promoção" },
          { valor: SEM_PROMOCAO, label: "Sem promoção" },
        ],
        corresponde: (produto, valor) =>
          valor === EM_PROMOCAO ? produto.ehPromocao : !produto.ehPromocao,
      },
      {
        id: FACETAS_PRODUTO.novidade,
        label: "Novidade",
        opcoes: [
          { valor: EH_NOVIDADE, label: "Novidades" },
          { valor: SEM_NOVIDADE, label: "Não novidades" },
        ],
        corresponde: (produto, valor) =>
          valor === EH_NOVIDADE ? produto.ehNovidade : !produto.ehNovidade,
      },
    ],
    [configuracoes?.categorias, colecoes, campanhas, fornecedores],
  );

  const filtragem = useFiltrosFacetados({
    itens: produtos,
    grupos,
    facetasExternas: data?.facets,
    selecao,
    onSelecaoChange: setSelecao,
  });
  // A lista já vem filtrada pela camada de dados.
  const visiveisTotal = produtos;

  // Busca, ordenação ou filtros mudaram: volta para a primeira página.
  useEffect(() => {
    setPagina(1);
  }, [filtros]);

  const total = visiveisTotal.length;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  // Recorte local por página; ao conectar a API real basta enviar page/limit.
  const visiveis = visiveisTotal.slice(inicio, inicio + POR_PAGINA);

  const temFiltros = Boolean(busca) || filtragem.temSelecao;

  function limparFiltros() {
    setBusca("");
    filtragem.limparTudo();
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
      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={filtragem.alternar}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={limparFiltros}
        resultado={
          <span className="text-sm text-muted-foreground">{total} produto(s) encontrado(s)</span>
        }
        cabecalho={
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative lg:max-w-sm lg:flex-1">
              <Search
                aria-hidden
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Buscar por código, nome ou categoria"
                placeholder="Buscar por código (PROD-0001), nome ou categoria…"
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
            </div>
          </div>
        }
      />

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, indice) => (
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
