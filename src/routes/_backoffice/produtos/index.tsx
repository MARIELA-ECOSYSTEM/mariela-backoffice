import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowUpDown,
  Boxes,
  Eye,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { StatusEstoqueBadge, TagBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PromocaoDialog } from "@/components/produtos/promocao-dialog";
import { useExcluirProduto, useDefinirPromocao, useProdutos } from "@/hooks/use-produtos";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { useCampanhas, useColecoes, useFornecedores } from "@/hooks/use-cadastros";
import { formatarMoeda } from "@/utils/format";
import { precoFinal } from "@/utils/produto";
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
        content: "Catálogo completo de produtos, variantes, preços e estoque.",
      },
      { property: "og:title", content: "Produtos — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Catálogo completo de produtos, variantes, preços e estoque.",
      },
    ],
  }),
  component: ProdutosPage,
});

const TODOS = "todos";

const ORDENACOES: { valor: OrdenarProdutoPor; label: string }[] = [
  { valor: "nome", label: "Nome" },
  { valor: "codProduto", label: "Código" },
  { valor: "precoVenda", label: "Preço" },
  { valor: "quantidadeTotal", label: "Estoque" },
  { valor: "criadoEm", label: "Data de criação" },
];

function LinhaProduto({
  produto,
  onExcluir,
  onPromocao,
}: {
  produto: Produto;
  onExcluir: (produto: Produto) => void;
  onPromocao: (produto: Produto) => void;
}) {
  const desativarPromocao = useDefinirPromocao(produto.id);

  async function desativar() {
    try {
      await desativarPromocao.mutateAsync({ ehPromocao: false });
      toast.success("Promoção desativada com sucesso.");
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível desativar a promoção."));
    }
  }

  const foto = produto.variantes.find((v) => v.foto)?.foto ?? null;

  return (
    <TableRow className="group">
      <TableCell>
        {foto ? (
          <img
            src={foto}
            alt={produto.nome}
            className="h-14 w-11 rounded-sm border border-border object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <span
            aria-label="Sem foto"
            className="flex h-14 w-11 items-center justify-center rounded-sm border border-dashed border-border-strong bg-surface text-muted-foreground/60"
          >
            <ImageIcon aria-hidden className="size-4" />
          </span>
        )}
      </TableCell>
      <TableCell className="font-brand text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
        {produto.codProduto}
      </TableCell>
      <TableCell className="max-w-[18rem]">
        <Link
          to="/produtos/$id"
          params={{ id: produto.id }}
          className="block truncate font-display text-base transition-colors hover:text-primary"
        >
          {produto.nome}
        </Link>
        <span className="block text-xs text-muted-foreground">
          {produto.variantes.length} variante(s)
        </span>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{produto.categoria}</TableCell>
      <TableCell className="text-sm tabular-nums">
        {produto.ehPromocao ? (
          <span className="flex flex-col leading-tight">
            <span className="text-xs text-muted-foreground line-through">
              {formatarMoeda(produto.precoVenda)}
            </span>
            <span className="text-primary">{formatarMoeda(precoFinal(produto))}</span>
          </span>
        ) : (
          formatarMoeda(produto.precoVenda)
        )}
      </TableCell>
      <TableCell className="tabular-nums">{produto.quantidadeTotal}</TableCell>
      <TableCell>
        <StatusEstoqueBadge quantidadeTotal={produto.quantidadeTotal} />
      </TableCell>
      <TableCell>
        {produto.ehNovidade ? (
          <TagBadge tom="primary">Novidade</TagBadge>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell>
        {produto.ehPromocao ? (
          <TagBadge tom="gold">Promoção</TagBadge>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Ações de ${produto.nome}`}>
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/produtos/$id" params={{ id: produto.id }}>
                <Eye aria-hidden className="size-4" /> Visualizar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/produtos/$id/editar" params={{ id: produto.id }}>
                <Pencil aria-hidden className="size-4" /> Editar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/produtos/$id/variantes" params={{ id: produto.id }}>
                <Boxes aria-hidden className="size-4" /> Gerenciar variantes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/estoque/$produtoId" params={{ produtoId: produto.id }}>
                <Plus aria-hidden className="size-4" /> Adicionar estoque
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {produto.ehPromocao ? (
              <DropdownMenuItem onSelect={() => void desativar()}>
                <Percent aria-hidden className="size-4" /> Desativar promoção
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onPromocao(produto)}>
                <Percent aria-hidden className="size-4" /> Ativar promoção
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onExcluir(produto)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 aria-hidden className="size-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

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
  const [ordenarPor, setOrdenarPor] = useState<OrdenarProdutoPor>("nome");
  const [ordem, setOrdem] = useState<Ordem>("asc");

  const [produtoPromocao, setProdutoPromocao] = useState<Produto | null>(null);
  const [produtoExclusao, setProdutoExclusao] = useState<Produto | null>(null);

  const { data: configuracoes } = useConfiguracoes();
  const { data: colecoes } = useColecoes();
  const { data: campanhas } = useCampanhas();
  const { data: fornecedores } = useFornecedores();
  const excluir = useExcluirProduto();

  const filtros = useMemo<ProdutoFiltros>(
    () => ({
      busca: busca || undefined,
      categoria: categoria === TODOS ? undefined : categoria,
      colecaoId: colecaoId === TODOS ? undefined : colecaoId,
      campanhaId: campanhaId === TODOS ? undefined : campanhaId,
      fornecedorId: fornecedorId === TODOS ? undefined : fornecedorId,
      disponibilidade,
      promocao,
      novidade,
      ordenarPor,
      ordem,
    }),
    [
      busca,
      categoria,
      colecaoId,
      campanhaId,
      fornecedorId,
      disponibilidade,
      promocao,
      novidade,
      ordenarPor,
      ordem,
    ],
  );

  const { data, isPending, isError, error, refetch, isFetching } = useProdutos(filtros);
  const produtos = data?.produtos ?? [];

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
      descricao="Cadastro completo do catálogo: preços, variantes por cor, tamanhos e disponibilidade."
      acoes={
        <Button onClick={() => void navigate({ to: "/produtos/novo" })}>
          <Plus aria-hidden className="size-4" /> Novo produto
        </Button>
      }
    >
      <Card className="mb-6 border-border bg-surface/60">
        <CardContent className="grid gap-3 py-5 lg:grid-cols-4 xl:grid-cols-5">
          <div className="relative lg:col-span-2">
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
            <SelectTrigger aria-label="Filtrar por disponibilidade">
              <SelectValue placeholder="Disponibilidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Disponibilidade: todas</SelectItem>
              <SelectItem value="disponivel">Disponível</SelectItem>
              <SelectItem value="sem-estoque">Sem estoque</SelectItem>
            </SelectContent>
          </Select>

          <Select value={promocao} onValueChange={(valor) => setPromocao(valor as FiltroBooleano)}>
            <SelectTrigger aria-label="Filtrar por promoção">
              <SelectValue placeholder="Promoção" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Promoção: todas</SelectItem>
              <SelectItem value="sim">Em promoção</SelectItem>
              <SelectItem value="nao">Sem promoção</SelectItem>
            </SelectContent>
          </Select>

          <Select value={novidade} onValueChange={(valor) => setNovidade(valor as FiltroBooleano)}>
            <SelectTrigger aria-label="Filtrar por novidade">
              <SelectValue placeholder="Novidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Novidade: todas</SelectItem>
              <SelectItem value="sim">Novidades</SelectItem>
              <SelectItem value="nao">Não novidades</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Select
              value={ordenarPor}
              onValueChange={(valor) => setOrdenarPor(valor as OrdenarProdutoPor)}
            >
              <SelectTrigger aria-label="Ordenar por">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                {ORDENACOES.map((opcao) => (
                  <SelectItem key={opcao.valor} value={opcao.valor}>
                    Ordenar: {opcao.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label={ordem === "asc" ? "Ordem crescente" : "Ordem decrescente"}
              onClick={() => setOrdem(ordem === "asc" ? "desc" : "asc")}
            >
              <ArrowUpDown aria-hidden className="size-4" />
            </Button>
          </div>

          {temFiltros ? (
            <Button variant="ghost" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isPending ? (
        <TableSkeleton linhas={8} colunas={7} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : produtos.length === 0 ? (
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
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Foto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Novidade</TableHead>
                <TableHead>Promoção</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((produto) => (
                <LinhaProduto
                  key={produto.id}
                  produto={produto}
                  onExcluir={setProdutoExclusao}
                  onPromocao={setProdutoPromocao}
                />
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border bg-surface/60 px-4 py-3 font-brand text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
            <span>{produtos.length} produto(s)</span>
            {isFetching ? <Badge variant="outline">Atualizando…</Badge> : null}
          </div>
        </Card>
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
