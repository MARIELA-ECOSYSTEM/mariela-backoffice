import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AtSign,
  Building2,
  Instagram,
  Pencil,
  Phone,
  Plus,
  Power,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AtivoBadge, DataToolbar, Paginacao } from "@/components/common/data-toolbar";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import { OPCOES_STATUS, type GrupoFacetaDef } from "@/lib/filtros/facetas";
import { EmptyState, ErrorState } from "@/components/common/states";
import {
  AvatarPessoa,
  GridSkeleton,
  PessoaCard,
  PessoaGrid,
} from "@/components/common/pessoa-card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  FORNECEDOR_VALORES_PADRAO,
  FornecedorDialog,
  type FornecedorFormValues,
} from "@/components/cadastros/fornecedor-dialog";
import {
  useAlterarStatusFornecedor,
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

const POR_PAGINA = 12;

type Ordenacao = "nome" | "recentes" | "produtos";

function FornecedoresPage() {
  const { data: fornecedores, isPending, isError, error, refetch } = useFornecedores();
  const { data: listaProdutos } = useProdutos({});
  const criar = useCriarFornecedor();
  const atualizar = useAtualizarFornecedor();
  const alterarStatus = useAlterarStatusFornecedor();
  const remover = useRemoverFornecedor();

  const [busca, setBusca] = useState("");

  const [ordem, setOrdem] = useState<Ordenacao>("nome");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Fornecedor | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Fornecedor | null>(null);
  const [detalhe, setDetalhe] = useState<Fornecedor | null>(null);

  const produtos = useMemo(() => listaProdutos?.produtos ?? [], [listaProdutos]);

  function produtosDo(fornecedorId: string) {
    return produtos.filter((produto) => produto.fornecedorId === fornecedorId);
  }

  const grupos = useMemo<GrupoFacetaDef<Fornecedor>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        opcoes: OPCOES_STATUS,
        corresponde: (fornecedor, valor) =>
          valor === "ativos" ? fornecedor.ativo : !fornecedor.ativo,
      },
      {
        id: "vinculo",
        label: "Produtos vinculados",
        opcoes: [
          { valor: "com", label: "Com produtos" },
          { valor: "sem", label: "Sem produtos" },
        ],
        corresponde: (fornecedor, valor) => {
          const quantidade = produtos.filter(
            (produto) => produto.fornecedorId === fornecedor.id,
          ).length;
          return valor === "com" ? quantidade > 0 : quantidade === 0;
        },
      },
      {
        id: "dados",
        label: "Dados cadastrais",
        opcoes: [
          { valor: "cnpj", label: "Com CNPJ" },
          { valor: "email", label: "Com e-mail" },
          { valor: "instagram", label: "Com Instagram" },
        ],
        corresponde: (fornecedor, valor) => {
          if (valor === "cnpj") return Boolean(fornecedor.cnpj);
          if (valor === "email") return Boolean(fornecedor.email);
          return Boolean(fornecedor.instagram);
        },
      },
    ],
    [produtos],
  );

  const buscados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (fornecedores ?? []).filter(
      (fornecedor) =>
        !termo ||
        fornecedor.nome.toLowerCase().includes(termo) ||
        fornecedor.contato.toLowerCase().includes(termo) ||
        fornecedor.telefone.toLowerCase().includes(termo) ||
        fornecedor.email.toLowerCase().includes(termo) ||
        fornecedor.cnpj.toLowerCase().includes(termo),
    );
  }, [fornecedores, busca]);

  const filtragem = useFiltrosFacetados({ itens: buscados, grupos });

  const filtrados = useMemo(() => {
    const copia = [...filtragem.itensFiltrados];
    if (ordem === "nome") return copia.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (ordem === "recentes") return copia.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    return copia.sort((a, b) => produtosDo(b.id).length - produtosDo(a.id).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtragem.itensFiltrados, ordem, produtos]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const valoresIniciais: FornecedorFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        foto: emEdicao.foto ?? "",
        contato: emEdicao.contato,
        telefone: emEdicao.telefone,
        email: emEdicao.email,
        cnpj: emEdicao.cnpj,
        instagram: emEdicao.instagram,
        ativo: emEdicao.ativo,
      }
    : FORNECEDOR_VALORES_PADRAO;

  function abrirNovo() {
    setEmEdicao(null);
    setDialogAberto(true);
  }

  async function salvar(valores: FornecedorFormValues) {
    const payload = { ...valores, foto: valores.foto || null };
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(emEdicao ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar o fornecedor."));
    }
  }

  async function alternarStatus(fornecedor: Fornecedor) {
    try {
      await alterarStatus.mutateAsync({ id: fornecedor.id, ativo: !fornecedor.ativo });
      toast.success(fornecedor.ativo ? "Fornecedor inativado." : "Fornecedor ativado.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível alterar o status."));
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
        placeholder="Buscar por nome, contato, telefone, e-mail ou CNPJ…"
      >
        <Select value={ordem} onValueChange={(valor) => setOrdem(valor as Ordenacao)}>
          <SelectTrigger className="w-52" aria-label="Ordenar fornecedores">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome (A–Z)</SelectItem>
            <SelectItem value="recentes">Cadastro mais recente</SelectItem>
            <SelectItem value="produtos">Mais produtos vinculados</SelectItem>
          </SelectContent>
        </Select>
      </DataToolbar>

      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={(grupoId, valor) => {
          filtragem.alternar(grupoId, valor);
          setPagina(1);
        }}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={filtragem.limparTudo}
        colunas={3}
        resultado={
          <span className="text-sm text-muted-foreground">
            {filtrados.length} fornecedor(es) encontrado(s)
          </span>
        }
      />

      {isPending ? (
        <GridSkeleton itens={8} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum fornecedor encontrado"
          descricao="Ajuste a busca e os filtros ou cadastre um novo parceiro de produção."
          acao={
            <Button onClick={abrirNovo}>
              <Plus aria-hidden className="size-4" />
              Novo fornecedor
            </Button>
          }
        />
      ) : (
        <PessoaGrid>
          {visiveis.map((fornecedor) => (
            <PessoaCard
              key={fornecedor.id}
              nome={fornecedor.nome}
              foto={fornecedor.foto}
              ativo={fornecedor.ativo}
              subtitulo={`Parceiro desde ${formatarData(fornecedor.criadoEm)}`}
              badgeExtra={
                <Badge variant="outline">{produtosDo(fornecedor.id).length} produto(s)</Badge>
              }
              campos={[
                { icon: User, label: "Contato", valor: fornecedor.contato },
                { icon: Phone, label: "Telefone", valor: fornecedor.telefone },
                { icon: AtSign, label: "E-mail", valor: fornecedor.email },
                ...(fornecedor.cnpj
                  ? [{ icon: Building2, label: "CNPJ", valor: fornecedor.cnpj }]
                  : []),
                ...(fornecedor.instagram
                  ? [{ icon: Instagram, label: "Instagram", valor: fornecedor.instagram }]
                  : []),
              ]}
              onVisualizar={() => setDetalhe(fornecedor)}
              acoes={[
                {
                  label: "Editar",
                  icon: Pencil,
                  onClick: () => {
                    setEmEdicao(fornecedor);
                    setDialogAberto(true);
                  },
                },
                {
                  label: fornecedor.ativo ? "Inativar" : "Ativar",
                  icon: Power,
                  onClick: () => void alternarStatus(fornecedor),
                },
                {
                  label: "Excluir",
                  icon: Trash2,
                  destrutivo: true,
                  separarAntes: true,
                  onClick: () => setParaExcluir(fornecedor),
                },
              ]}
            />
          ))}
        </PessoaGrid>
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
              <div className="flex items-center gap-4">
                <AvatarPessoa nome={detalhe.nome} foto={detalhe.foto} className="size-16" />
                <AtivoBadge ativo={detalhe.ativo} />
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Contato</dt>
                  <dd>{detalhe.contato || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd>{detalhe.telefone || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">E-mail</dt>
                  <dd>{detalhe.email || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">CNPJ</dt>
                  <dd>{detalhe.cnpj || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Instagram</dt>
                  <dd>{detalhe.instagram || "—"}</dd>
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
