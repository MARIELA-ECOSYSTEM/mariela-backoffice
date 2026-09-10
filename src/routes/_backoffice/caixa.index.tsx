import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  HandCoins,
  Landmark,
  Scale,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataToolbar, NotaDemonstracao, Paginacao } from "@/components/common/data-toolbar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { Metrica } from "@/components/dashboard/metrica";
import { PainelFiltros } from "@/components/filtros/painel-filtros";
import { useFiltrosFacetados } from "@/hooks/use-filtros-facetados";
import { opcoesDeValores, type GrupoFacetaDef } from "@/lib/filtros/facetas";
import { CaixaCard, CaixasGrid, CaixasGridSkeleton } from "@/components/caixa/caixa-card";
import { MovimentacoesTabela } from "@/components/caixa/movimentacoes-tabela";
import { AberturaCaixaDialog } from "@/components/caixa/abertura-dialog";
import { useAbrirCaixa, useCaixaAtual, useCaixas, useEstatisticasCaixa } from "@/hooks/use-caixas";
import { mensagemDeErro } from "@/services/api/client";
import { formatarDataHora, formatarMoeda } from "@/utils/format";
import { LABEL_STATUS_CAIXA, STATUS_CAIXA, type Caixa } from "@/types/caixa";
import {
  FAIXAS_SALDO_CAIXA,
  OPCOES_DIFERENCA_CAIXA,
  OPCOES_ORDENACAO_CAIXA,
  OPCOES_PERIODO_CAIXA,
  caixaNaFaixa,
  caixaNoPeriodo,
  caixaTemDiferenca,
  ordenarCaixas,
  type OrdenacaoCaixa,
  type PeriodoCaixa,
} from "@/utils/caixa";

export const Route = createFileRoute("/_backoffice/caixa/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Caixa — MARIELA Backoffice" },
      {
        name: "description",
        content:
          "Abertura, movimentações, conferência e fechamento do caixa da loja, com histórico financeiro imutável.",
      },
      { property: "og:title", content: "Caixa — MARIELA Backoffice" },
      {
        property: "og:description",
        content:
          "Abertura, movimentações, conferência e fechamento do caixa da loja, com histórico financeiro imutável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaixaPage,
});

const POR_PAGINA = 9;

function CaixaPage() {
  const { data: caixas, isPending, isError, error, refetch } = useCaixas();
  const { data: atual } = useCaixaAtual();
  const { data: estatisticas } = useEstatisticasCaixa();
  const abrir = useAbrirCaixa();

  const [aberturaAberta, setAberturaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdenacaoCaixa>("data-desc");
  const [pagina, setPagina] = useState(1);

  const responsaveis = useMemo(
    () => Array.from(new Set((caixas ?? []).map((caixa) => caixa.abertura.responsavelNome))).sort(),
    [caixas],
  );

  const grupos = useMemo<GrupoFacetaDef<Caixa>[]>(
    () => [
      {
        id: "status",
        label: "Status",
        opcoes: STATUS_CAIXA.map((status) => ({
          valor: status,
          label: LABEL_STATUS_CAIXA[status],
        })),
        corresponde: (caixa, valor) => caixa.status === valor,
      },
      {
        id: "periodo",
        label: "Período",
        opcoes: OPCOES_PERIODO_CAIXA.map((opcao) => ({ valor: opcao.valor, label: opcao.label })),
        corresponde: (caixa, valor) => caixaNoPeriodo(caixa, valor as PeriodoCaixa),
      },
      {
        id: "responsavel",
        label: "Responsável",
        opcoes: opcoesDeValores(responsaveis),
        buscavel: true,
        placeholderBusca: "Buscar responsável…",
        corresponde: (caixa, valor) => caixa.abertura.responsavelNome === valor,
      },
      {
        id: "diferenca",
        label: "Diferença",
        opcoes: OPCOES_DIFERENCA_CAIXA,
        corresponde: (caixa, valor) => caixaTemDiferenca(caixa, valor),
      },
      {
        id: "saldo",
        label: "Faixa de saldo",
        opcoes: FAIXAS_SALDO_CAIXA.map((faixa) => ({ valor: faixa.valor, label: faixa.label })),
        corresponde: (caixa, valor) => caixaNaFaixa(caixa, valor),
      },
    ],
    [responsaveis],
  );

  const buscados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return caixas ?? [];
    return (caixas ?? []).filter(
      (caixa) =>
        caixa.codigo.toLowerCase().includes(termo) ||
        caixa.abertura.responsavelNome.toLowerCase().includes(termo),
    );
  }, [caixas, busca]);

  const filtragem = useFiltrosFacetados({ itens: buscados, grupos });
  const filtrados = useMemo(
    () => ordenarCaixas(filtragem.itensFiltrados, ordem),
    [filtragem.itensFiltrados, ordem],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function abrirCaixa(payload: Parameters<typeof abrir.mutate>[0]) {
    abrir.mutate(payload, {
      onSuccess: (caixa) => {
        toast.success(`${caixa.codigo} aberto com ${formatarMoeda(caixa.abertura.valorInicial)}.`);
        setAberturaAberta(false);
      },
      onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível concluir a operação.")),
    });
  }

  return (
    <Page
      titulo="Caixa"
      breadcrumbs={[{ label: "Operação" }, { label: "Caixa" }]}
      descricao="Abertura, movimentações, conferência e fechamento do caixa da loja. Caixa fechado é histórico imutável."
      acoes={
        <Button
          onClick={() => {
            if (atual) {
              toast.error("Já existe um caixa aberto.");
              return;
            }
            setAberturaAberta(true);
          }}
        >
          <Landmark aria-hidden className="size-4" />
          Abrir caixa
        </Button>
      }
    >
      <NotaDemonstracao>
        As vendas nascem no <strong>MARIELA PDV</strong> e são vinculadas ao caixa aberto. Somente o
        valor <strong>efetivamente recebido</strong> entra no caixa — o pendente de uma venda em
        pagamento não entra.
      </NotaDemonstracao>

      {atual ? (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex flex-wrap items-center gap-3 font-display text-2xl">
              Caixa aberto
              <CodigoBadge codigo={atual.codigo} />
              <Badge>{LABEL_STATUS_CAIXA[atual.status]}</Badge>
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/caixa/$id" params={{ id: atual.id }}>
                  Ver caixa
                </Link>
              </Button>
              <Button asChild>
                <Link to="/caixa/$id" params={{ id: atual.id }}>
                  Conferir e fechar
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 text-sm sm:grid-cols-3 xl:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Responsável</p>
                <p>{atual.abertura.responsavelNome}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Abertura</p>
                <p>{formatarDataHora(atual.abertura.dataHora)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Valor de abertura</p>
                <p className="tabular-nums">{formatarMoeda(atual.resumo.valorAbertura)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Saldo esperado</p>
                <p className="font-medium tabular-nums text-primary">
                  {formatarMoeda(atual.resumo.saldoEsperado)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Metrica
                rotulo="Entradas"
                valor={atual.resumo.totalEntradas}
                tipo="valor"
                icone={ArrowUpCircle}
              />
              <Metrica
                rotulo="Saídas"
                valor={atual.resumo.totalSaidas}
                tipo="valor"
                icone={ArrowDownCircle}
              />
              <Metrica
                rotulo="Vendas"
                valor={atual.resumo.totalVendas}
                tipo="valor"
                icone={Banknote}
                detalhe={`${atual.resumo.quantidadeVendas} venda(s) vinculada(s)`}
              />
              <Metrica
                rotulo="Recebimentos"
                valor={atual.resumo.recebimentos}
                tipo="valor"
                icone={HandCoins}
              />
              <Metrica
                rotulo="Devoluções"
                valor={atual.resumo.devolucoes}
                tipo="valor"
                icone={Undo2}
              />
            </div>

            <section>
              <h2 className="mb-2 text-sm font-medium text-foreground/80">Últimas movimentações</h2>
              <MovimentacoesTabela movimentacoes={atual.movimentacoes.slice(0, 10)} />
            </section>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="py-6">
            <EmptyState
              titulo="Nenhum caixa aberto"
              descricao="Abra um caixa para começar a registrar as movimentações financeiras do dia."
            />
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          rotulo="Entradas hoje"
          valor={estatisticas?.entradasHoje ?? 0}
          tipo="valor"
          icone={ArrowUpCircle}
          destaque
        />
        <Metrica
          rotulo="Saídas hoje"
          valor={estatisticas?.saidasHoje ?? 0}
          tipo="valor"
          icone={ArrowDownCircle}
        />
        <Metrica
          rotulo="Recebimentos hoje"
          valor={estatisticas?.recebimentosHoje ?? 0}
          tipo="valor"
          icone={HandCoins}
          detalhe={`Devoluções: ${formatarMoeda(estatisticas?.devolucoesHoje ?? 0)}`}
        />
        <Metrica
          rotulo="Caixas fechados"
          valor={estatisticas?.caixasFechados ?? 0}
          tipo="quantidade"
          unidade="caixa(s)"
          icone={Scale}
          detalhe={`Diferença acumulada: ${formatarMoeda(estatisticas?.diferencaAcumulada ?? 0)}`}
        />
      </div>

      <DataToolbar
        busca={busca}
        onBuscaChange={(valor) => {
          setBusca(valor);
          setPagina(1);
        }}
        placeholder="Buscar por código do caixa ou responsável…"
      >
        <Select value={ordem} onValueChange={(valor) => setOrdem(valor as OrdenacaoCaixa)}>
          <SelectTrigger className="w-60" aria-label="Ordenar caixas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPCOES_ORDENACAO_CAIXA.map((opcao) => (
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
        onAlternar={(grupoId, valor) => {
          filtragem.alternar(grupoId, valor);
          setPagina(1);
        }}
        onLimparGrupo={filtragem.limparGrupo}
        onLimparTudo={filtragem.limparTudo}
        resultado={
          <span className="text-sm text-muted-foreground">
            {filtrados.length} caixa(s) encontrado(s)
          </span>
        }
      />

      {isPending ? (
        <CaixasGridSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum caixa encontrado"
          descricao="Ajuste a busca e os filtros para localizar os caixas do histórico."
        />
      ) : (
        <CaixasGrid>
          {visiveis.map((caixa) => (
            <CaixaCard key={caixa.id} caixa={caixa} />
          ))}
        </CaixasGrid>
      )}

      <Paginacao
        pagina={paginaAtual}
        totalPaginas={totalPaginas}
        total={filtrados.length}
        rotulo="caixa(s)"
        onPaginaChange={setPagina}
      />

      <AberturaCaixaDialog
        open={aberturaAberta}
        onOpenChange={setAberturaAberta}
        salvando={abrir.isPending}
        onConfirmar={abrirCaixa}
      />
    </Page>
  );
}
