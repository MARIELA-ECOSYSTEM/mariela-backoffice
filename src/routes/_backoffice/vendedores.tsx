import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, History, KeyRound, Pencil, Phone, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
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
import { EmptyState, ErrorState } from "@/components/common/states";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import { OPCOES_STATUS, type GrupoFacetaDef, type SelecaoFacetas } from "@/lib/filtros/facetas";
import {
  AvatarPessoa,
  GridSkeleton,
  PessoaCard,
  PessoaGrid,
} from "@/components/common/pessoa-card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  VENDEDOR_VALORES_PADRAO,
  VendedorDialog,
  type VendedorFormValues,
} from "@/components/cadastros/vendedor-dialog";
import { SenhaDialog, type SenhaFormValues } from "@/components/cadastros/senha-dialog";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { BotaoWhatsapp } from "@/components/cadastros/botao-whatsapp";
import { VendedorVendasDialog } from "@/components/cadastros/vendedor-vendas-dialog";
import {
  DialogMensagemWhatsapp,
  type AlvoMensagemWhatsapp,
} from "@/components/cadastros/dialog-mensagem-whatsapp";
import {
  useAlterarStatusVendedor,
  useAtualizarVendedor,
  useCriarVendedor,
  useRedefinirSenhaVendedor,
  useRemoverVendedor,
  useVendedores,
} from "@/hooks/use-vendedores";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData, formatarMoeda } from "@/utils/format";
import { formatarTelefone, normalizarTelefone } from "@/utils/cliente";
import {
  OPCOES_FAIXA_VALOR,
  OPCOES_FAIXA_VENDAS,
  OPCOES_ORDENACAO_VENDEDOR,
  OPCOES_ULTIMA_VENDA,
  nascimentoNoMes,
  naFaixaDeValor,
  naFaixaDeVendas,
  paraOrdenarPorEOrdem,
  ultimaVendaNoPeriodo,
  type OrdenacaoVendedor,
} from "@/utils/vendedor";
import type { Vendedor, VendedorFiltros, VendedorPayload } from "@/types/vendedor";

export const Route = createFileRoute("/_backoffice/vendedores")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vendedores — MARIELA Backoffice" },
      {
        name: "description",
        content: "Gerenciamento dos vendedores que utilizam o MARIELA PDV.",
      },
      { property: "og:title", content: "Vendedores — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Gerenciamento dos vendedores que utilizam o MARIELA PDV.",
      },
    ],
  }),
  component: VendedoresPage,
});

const POR_PAGINA = 12;

function VendedoresPage() {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdenacaoVendedor>("nome-asc");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Vendedor | null>(null);
  const [paraSenha, setParaSenha] = useState<Vendedor | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Vendedor | null>(null);
  const [detalhe, setDetalhe] = useState<Vendedor | null>(null);
  const [vendasDe, setVendasDe] = useState<Vendedor | null>(null);
  const [alvoMensagem, setAlvoMensagem] = useState<AlvoMensagemWhatsapp | null>(null);

  // Seleção das facetas é enviada à camada de dados: os counts NÃO são
  // calculados sobre a página atual, e sim devolvidos em `facets` — mesmo
  // esquema já usado em Clientes/Fornecedores/Coleções/Campanhas.
  const [selecao, setSelecao] = useState<SelecaoFacetas>({});

  const criar = useCriarVendedor();
  const atualizar = useAtualizarVendedor();
  const alterarStatus = useAlterarStatusVendedor();
  const redefinirSenha = useRedefinirSenhaVendedor();
  const remover = useRemoverVendedor();

  // Busca, facetas ou ordenação mudaram: o conjunto/ordem de resultados é
  // outro, então a paginação sempre recomeça em 1. Sem `pagina`/`limit` nesta
  // dependência, para o efeito abaixo não entrar em looping consigo mesmo a
  // cada troca de página.
  const criteriosFiltro = useMemo(
    () => ({ busca: busca || undefined, facetas: selecao, ...paraOrdenarPorEOrdem(ordem) }),
    [busca, selecao, ordem],
  );

  useEffect(() => {
    setPagina(1);
  }, [criteriosFiltro]);

  const filtros = useMemo<VendedorFiltros>(
    () => ({ ...criteriosFiltro, page: pagina, limit: POR_PAGINA }),
    [criteriosFiltro, pagina],
  );

  const { data, isPending, isError, error, refetch, isFetching } = useVendedores(filtros);
  const vendedores = useMemo(() => data?.vendedores ?? [], [data?.vendedores]);
  const totalPaginas = data?.meta.totalPages ?? 1;
  const total = data?.meta.total ?? 0;
  const paginaAtual = pagina;

  // A página pedida pode ficar fora do intervalo depois que o conjunto de
  // resultados muda de tamanho (ex.: um vendedor foi excluído e a página 5
  // deixou de existir) — corrige para a última página válida em vez de
  // deixar "página 5 de 3" na tela.
  useEffect(() => {
    if (data && pagina > data.meta.totalPages) {
      setPagina(data.meta.totalPages);
    }
  }, [data, pagina]);

  const grupos = useMemo<GrupoFacetaDef<Vendedor>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        opcoes: OPCOES_STATUS,
        corresponde: (vendedor, valor) => (valor === "ativos" ? vendedor.ativo : !vendedor.ativo),
      },
      {
        id: "vendas",
        label: "Vendas",
        opcoes: OPCOES_FAIXA_VENDAS.map((opcao) => ({ valor: opcao.valor, label: opcao.label })),
        corresponde: (vendedor, valor) => naFaixaDeVendas(vendedor.vendas, valor),
      },
      {
        id: "valor",
        label: "Total vendido",
        opcoes: OPCOES_FAIXA_VALOR.map((opcao) => ({ valor: opcao.valor, label: opcao.label })),
        corresponde: (vendedor, valor) => naFaixaDeValor(vendedor.totalVendido, valor),
      },
      {
        id: "ultimaVenda",
        label: "Última venda",
        opcoes: OPCOES_ULTIMA_VENDA.map((opcao) => ({ valor: opcao.valor, label: opcao.label })),
        corresponde: (vendedor, valor) => ultimaVendaNoPeriodo(vendedor, valor),
      },
      {
        id: "nascimento",
        label: "Aniversário",
        opcoes: [
          { valor: "mes", label: "Neste mês" },
          { valor: "com", label: "Com data cadastrada" },
          { valor: "sem", label: "Sem data cadastrada" },
        ],
        corresponde: (vendedor, valor) =>
          valor === "mes"
            ? nascimentoNoMes(vendedor.dataNascimento)
            : valor === "com"
              ? Boolean(vendedor.dataNascimento)
              : !vendedor.dataNascimento,
      },
      {
        id: "observacao",
        label: "Observação",
        opcoes: [
          { valor: "com", label: "Com observação" },
          { valor: "sem", label: "Sem observação" },
        ],
        corresponde: (vendedor, valor) =>
          valor === "com" ? Boolean(vendedor.observacao) : !vendedor.observacao,
      },
    ],
    [],
  );

  const filtragem = useFiltrosFacetados({
    itens: vendedores,
    grupos,
    facetasExternas: data?.facets,
    selecao,
    onSelecaoChange: setSelecao,
  });

  const temFiltros = Boolean(busca) || filtragem.temSelecao;

  function limparFiltros() {
    setBusca("");
    filtragem.limparTudo();
  }

  const valoresIniciais: VendedorFormValues = emEdicao
    ? {
        nome: emEdicao.nome,
        foto: emEdicao.foto ?? "",
        telefone: formatarTelefone(emEdicao.telefone),
        dataNascimento: emEdicao.dataNascimento ?? "",
        observacao: emEdicao.observacao,
        senha: "",
        confirmacaoSenha: "",
        ativo: emEdicao.ativo,
      }
    : VENDEDOR_VALORES_PADRAO;

  function abrirNovo() {
    setEmEdicao(null);
    setDialogAberto(true);
  }

  async function salvar(valores: VendedorFormValues) {
    const payload: VendedorPayload = {
      nome: valores.nome,
      foto: valores.foto || null,
      telefone: normalizarTelefone(valores.telefone),
      dataNascimento: valores.dataNascimento || null,
      observacao: valores.observacao,
      ativo: valores.ativo,
      ...(valores.senha ? { senha: valores.senha } : {}),
    };
    try {
      if (emEdicao) await atualizar.mutateAsync({ id: emEdicao.id, payload });
      else await criar.mutateAsync(payload);
      toast.success(emEdicao ? "Vendedor(a) atualizado(a)." : "Vendedor(a) cadastrado(a).");
      setDialogAberto(false);
      setEmEdicao(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível salvar o vendedor."));
    }
  }

  async function alternarStatus(vendedor: Vendedor) {
    try {
      await alterarStatus.mutateAsync({ id: vendedor.id, ativo: !vendedor.ativo });
      toast.success(vendedor.ativo ? "Acesso ao PDV suspenso." : "Acesso ao PDV liberado.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível alterar o status."));
    }
  }

  async function salvarSenha(valores: SenhaFormValues) {
    if (!paraSenha) return;
    try {
      await redefinirSenha.mutateAsync({ id: paraSenha.id, senha: valores.senha });
      toast.success("Senha redefinida.");
      setParaSenha(null);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível redefinir a senha."));
    }
  }

  async function excluir(vendedor: Vendedor) {
    try {
      await remover.mutateAsync(vendedor.id);
      toast.success("Vendedor(a) excluído(a).");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível excluir o vendedor."));
    } finally {
      setParaExcluir(null);
    }
  }

  return (
    <Page
      titulo="Vendedores"
      breadcrumbs={[{ label: "Cadastros" }, { label: "Vendedores" }]}
      descricao="Usuários do MARIELA PDV. O backoffice é exclusivo da administração — vendedores não acessam esta área."
      acoes={
        <Button onClick={abrirNovo}>
          <Plus aria-hidden className="size-4" />
          Novo vendedor
        </Button>
      }
    >
      <DataToolbar
        busca={busca}
        onBuscaChange={setBusca}
        placeholder="Buscar por nome, código ou telefone…"
      >
        <Select value={ordem} onValueChange={(valor) => setOrdem(valor as OrdenacaoVendedor)}>
          <SelectTrigger className="w-60" aria-label="Ordenar vendedores">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPCOES_ORDENACAO_VENDEDOR.map((opcao) => (
              <SelectItem key={opcao.valor} value={opcao.valor}>
                {opcao.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataToolbar>

      <PainelFiltros
        grupos={filtragem.grupos}
        totalSelecionados={filtragem.totalSelecionados}
        onAlternar={filtragem.alternar}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={limparFiltros}
        colunas={3}
        resultado={
          <span className="text-sm text-muted-foreground">{total} vendedor(as) encontrada(s)</span>
        }
      />

      {isPending ? (
        <GridSkeleton itens={8} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          titulo="Nenhum vendedor encontrado"
          descricao="Ajuste a busca e os filtros ou cadastre o primeiro usuário do PDV."
          acao={
            temFiltros ? (
              <Button variant="outline" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            ) : (
              <Button onClick={abrirNovo}>
                <Plus aria-hidden className="size-4" />
                Novo vendedor
              </Button>
            )
          }
        />
      ) : (
        <PessoaGrid>
          {vendedores.map((vendedor) => (
            <PessoaCard
              key={vendedor.id}
              nome={vendedor.nome}
              foto={vendedor.foto}
              ativo={vendedor.ativo}
              subtitulo="Usuário do MARIELA PDV"
              badgeExtra={<CodigoBadge codigo={vendedor.codigo} />}
              campos={[
                { icon: Phone, label: "Telefone", valor: formatarTelefone(vendedor.telefone) },
                {
                  icon: CalendarDays,
                  label: "Nascimento",
                  valor: vendedor.dataNascimento
                    ? `Nascimento em ${formatarData(vendedor.dataNascimento)}`
                    : "Nascimento não informado",
                },
              ]}
              metricas={[
                { label: "Vendas", valor: String(vendedor.vendas) },
                {
                  label: "Total vendido",
                  valor: formatarMoeda(vendedor.totalVendido),
                  destaque: true,
                },
                {
                  label: "Última venda",
                  valor: vendedor.ultimaVenda ? formatarData(vendedor.ultimaVenda) : "—",
                },
              ]}
              observacao={vendedor.observacao}
              acaoRapida={
                <BotaoWhatsapp
                  nome={vendedor.nome}
                  numero={vendedor.telefone}
                  onClick={() =>
                    setAlvoMensagem({
                      id: vendedor.id,
                      nome: vendedor.nome,
                      telefone: vendedor.telefone,
                      tipoMensagem: "vendedor",
                      papel: "Vendedor(a)",
                    })
                  }
                />
              }
              onVisualizar={() => setDetalhe(vendedor)}
              acoes={[
                {
                  label: "Ver vendas",
                  icon: History,
                  onClick: () => setVendasDe(vendedor),
                },
                {
                  label: "Editar",
                  icon: Pencil,
                  onClick: () => {
                    setEmEdicao(vendedor);
                    setDialogAberto(true);
                  },
                },
                {
                  label: vendedor.ativo ? "Inativar" : "Ativar",
                  icon: Power,
                  onClick: () => void alternarStatus(vendedor),
                },
                {
                  label: "Redefinir senha",
                  icon: KeyRound,
                  onClick: () => setParaSenha(vendedor),
                },
                {
                  label: "Excluir",
                  icon: Trash2,
                  destrutivo: true,
                  separarAntes: true,
                  onClick: () => setParaExcluir(vendedor),
                },
              ]}
            />
          ))}
        </PessoaGrid>
      )}

      {total > 0 ? (
        <div className="mt-7 flex items-center justify-end">
          {isFetching ? <span className="text-xs text-muted-foreground">Atualizando…</span> : null}
        </div>
      ) : null}

      <Paginacao
        pagina={paginaAtual}
        totalPaginas={totalPaginas}
        total={total}
        rotulo="vendedor(es)"
        onPaginaChange={setPagina}
      />

      <VendedorDialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          setDialogAberto(aberto);
          if (!aberto) setEmEdicao(null);
        }}
        edicao={emEdicao !== null}
        codigo={emEdicao?.codigo}
        valoresIniciais={valoresIniciais}
        salvando={criar.isPending || atualizar.isPending}
        onSubmit={(valores) => void salvar(valores)}
      />

      <VendedorVendasDialog
        vendedor={vendasDe}
        onOpenChange={(aberto) => {
          if (!aberto) setVendasDe(null);
        }}
      />

      <DialogMensagemWhatsapp
        alvo={alvoMensagem}
        onOpenChange={(aberto) => {
          if (!aberto) setAlvoMensagem(null);
        }}
      />

      <SenhaDialog
        open={paraSenha !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaSenha(null);
        }}
        nome={paraSenha?.nome ?? ""}
        salvando={redefinirSenha.isPending}
        onSubmit={(valores) => void salvarSenha(valores)}
      />

      <ConfirmDialog
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null);
        }}
        titulo="Excluir vendedor"
        descricao={
          paraExcluir
            ? `"${paraExcluir.nome}" perderá o acesso ao MARIELA PDV. Esta ação não pode ser desfeita.`
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
            <SheetDescription>Dados do vendedor e acesso ao PDV.</SheetDescription>
          </SheetHeader>

          {detalhe ? (
            <div className="space-y-6 px-4 pb-6">
              <div className="flex items-center gap-4">
                <AvatarPessoa nome={detalhe.nome} foto={detalhe.foto} className="size-16" />
                <AtivoBadge ativo={detalhe.ativo} />
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Código</dt>
                  <dd>
                    <CodigoBadge codigo={detalhe.codigo} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd>{formatarTelefone(detalhe.telefone) || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Vendas</dt>
                  <dd>
                    {detalhe.vendas} · {formatarMoeda(detalhe.totalVendido)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Última venda</dt>
                  <dd>{formatarData(detalhe.ultimaVenda)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Nascimento</dt>
                  <dd>{formatarData(detalhe.dataNascimento)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Cadastro</dt>
                  <dd>{formatarData(detalhe.criadoEm)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Atualização</dt>
                  <dd>{formatarData(detalhe.atualizadoEm)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Observação</dt>
                  <dd className="max-w-[60%] text-right">{detalhe.observacao || "—"}</dd>
                </div>
              </dl>

              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={() => setVendasDe(detalhe)}>
                  <History aria-hidden className="size-4" />
                  Ver vendas vinculadas
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setParaSenha(detalhe)}>
                  <KeyRound aria-hidden className="size-4" />
                  Redefinir senha do PDV
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
