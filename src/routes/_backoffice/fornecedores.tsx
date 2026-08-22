import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Phone, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataToolbar, Paginacao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  FORNECEDOR_VALORES_PADRAO,
  FornecedorDialog,
  type FornecedorFormValues,
} from "@/components/cadastros/fornecedor-dialog";
import {
  useAtualizarFornecedor,
  useCriarFornecedor,
  useFornecedores,
  useRemoverFornecedor,
} from "@/hooks/use-cadastros";
import { useProdutos } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData, formatarMoeda } from "@/utils/format";
import { precoFinal } from "@/utils/produto";
import type { Fornecedor } from "@/types/fornecedor";

export const Route = createFileRoute("/_backoffice/fornecedores")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Fornecedores — MARIELA Backoffice" },
      { name: "description", content: "Cadastro de fornecedores e parceiros de produção." },
      { property: "og:title", content: "Fornecedores — MARIELA Backoffice" },
      { property: "og:description", content: "Cadastro de fornecedores e parceiros de produção." },
    ],
  }),
  component: FornecedoresPage,
});

const POR_PAGINA = 10;

function FornecedoresPage() {
  const { data: fornecedores, isPending, isError, error, refetch } = useFornecedores();
  const { data: listaProdutos } = useProdutos({});
  const criar = useCriarFornecedor();
  const atualizar = useAtualizarFornecedor();
  const remover = useRemoverFornecedor();

  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Fornecedor | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Fornecedor | null>(null);
  const [detalhe, setDetalhe] = useState<Fornecedor | null>(null);

  const produtos = listaProdutos?.produtos ?? [];

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return fornecedores ?? [];
    return (fornecedores ?? []).filter(
      (fornecedor) =>
        fornecedor.nome.toLowerCase().includes(termo) ||
        fornecedor.contato.toLowerCase().includes(termo) ||
        fornecedor.telefone.toLowerCase().includes(termo),
    );
  }, [fornecedores, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const valoresIniciais: FornecedorFormValues = emEdicao
    ? { nome: emEdicao.nome, contato: emEdicao.contato, telefone: emEdicao.telefone }
    : FORNECEDOR_VALORES_PADRAO;

  function produtosDo(fornecedorId: string) {
    return produtos.filter((produto) => produto.fornecedorId === fornecedorId);
  }

  function abrirNovo() {
    setEmEdicao(null);
    setDialogAberto(true);
  }

  async function salvar(valores: FornecedorFormValues) {
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload: valores });
      else await criar.mutateAsync(valores);
      toast.success(emEdicao ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar o fornecedor."));
    }
  }

  async function excluir(fornecedor: Fornecedor) {
    try {
      await remover.mutateAsync(fornecedor.id);
      toast.success("Fornecedor excluído.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o fornecedor."));
    } finally {
      setParaExcluir(null);
    }
  }

  return (
    <Page
      titulo="Fornecedores"
      breadcrumbs={[{ label: "Cadastros" }, { label: "Fornecedores" }]}
      descricao="Parceiros de produção da loja. Veja os produtos vinculados a cada fornecedor."
      acoes={
        <Button onClick={abrirNovo}>
          <Plus aria-hidden className="size-4" />
          Novo fornecedor
        </Button>
      }
    >
      <DataToolbar
        busca={busca}
        onBuscaChange={(valor) => {
          setBusca(valor);
          setPagina(1);
        }}
        placeholder="Buscar por nome, contato ou telefone…"
      />

      {isPending ? (
        <TableSkeleton linhas={6} colunas={5} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum fornecedor encontrado"
          descricao="Ajuste a busca ou cadastre um novo parceiro de produção."
          acao={
            <Button onClick={abrirNovo}>
              <Plus aria-hidden className="size-4" />
              Novo fornecedor
            </Button>
          }
        />
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Produtos</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setDetalhe(fornecedor)}
                        className="text-left font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {fornecedor.nome}
                      </button>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Desde {formatarData(fornecedor.criadoEm)}
                      </p>
                    </TableCell>
                    <TableCell>{fornecedor.contato || "—"}</TableCell>
                    <TableCell>{fornecedor.telefone || "—"}</TableCell>
                    <TableCell className="text-right">
                      {produtosDo(fornecedor.id).length}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${fornecedor.nome}`}
                          onClick={() => {
                            setEmEdicao(fornecedor);
                            setDialogAberto(true);
                          }}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir ${fornecedor.nome}`}
                          onClick={() => setParaExcluir(fornecedor)}
                        >
                          <Trash2 aria-hidden className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Paginacao
        pagina={paginaAtual}
        totalPaginas={totalPaginas}
        total={filtrados.length}
        rotulo="fornecedor(es)"
        onPaginaChange={setPagina}
      />

      <FornecedorDialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          setDialogAberto(aberto);
          if (!aberto) setEmEdicao(null);
        }}
        edicao={emEdicao !== null}
        valoresIniciais={valoresIniciais}
        salvando={criar.isPending || atualizar.isPending}
        onSubmit={(valores) => void salvar(valores)}
      />

      <ConfirmDialog
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null);
        }}
        titulo="Excluir fornecedor"
        descricao={
          paraExcluir
            ? `"${paraExcluir.nome}" será removido. Fornecedores com produtos vinculados não podem ser excluídos.`
            : ""
        }
        confirmarLabel="Excluir"
        onConfirm={() => {
          if (paraExcluir) void excluir(paraExcluir);
        }}
      />

      <Sheet
        open={detalhe !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhe(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-3xl">{detalhe?.nome}</SheetTitle>
            <SheetDescription>Dados do fornecedor e produtos relacionados.</SheetDescription>
          </SheetHeader>

          {detalhe ? (
            <div className="space-y-6 px-4 pb-6">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Contato</dt>
                  <dd className="flex items-center gap-2">
                    <User aria-hidden className="size-4 text-primary/70" />
                    {detalhe.contato || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd className="flex items-center gap-2">
                    <Phone aria-hidden className="size-4 text-primary/70" />
                    {detalhe.telefone || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Cadastro</dt>
                  <dd>{formatarData(detalhe.criadoEm)}</dd>
                </div>
              </dl>

              <div>
                <p className="text-eyebrow mb-3">Produtos relacionados</p>
                {produtosDo(detalhe.id).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum produto vinculado a este fornecedor.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {produtosDo(detalhe.id).map((produto) => (
                      <li key={produto.id}>
                        <Link
                          to="/produtos/$id"
                          params={{ id: produto.id }}
                          className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface/50 px-4 py-3 transition-colors hover:bg-primary-soft/40"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {produto.nome}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {produto.codProduto} · {produto.quantidadeTotal} peça(s)
                            </span>
                          </span>
                          <span className="text-sm">{formatarMoeda(precoFinal(produto))}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
