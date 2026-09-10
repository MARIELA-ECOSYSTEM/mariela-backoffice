import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  HandCoins,
  Lock,
  MinusCircle,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { EmptyState, ErrorState } from "@/components/common/states";
import { MovimentacoesTabela } from "@/components/caixa/movimentacoes-tabela";
import { MovimentacaoCaixaDialog } from "@/components/caixa/movimentacao-dialog";
import { FechamentoCaixaDialog } from "@/components/caixa/fechamento-dialog";
import { useCaixa, useEntradaCaixa, useFecharCaixa, useSaidaCaixa } from "@/hooks/use-caixas";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData, formatarDataHora, formatarMoeda } from "@/utils/format";
import { LABEL_STATUS_CAIXA, type SaidaCaixaPayload } from "@/types/caixa";
import { LABEL_DIFERENCA, VARIANTE_STATUS_CAIXA, situacaoDiferenca } from "@/utils/caixa";
import { LABEL_STATUS_VENDA } from "@/types/venda";
import { VARIANTE_STATUS_VENDA } from "@/utils/venda";

export const Route = createFileRoute("/_backoffice/caixa/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhe do caixa — MARIELA Backoffice" },
      {
        name: "description",
        content:
          "Resumo financeiro, movimentações, vendas vinculadas, recebimentos de fiado e conferência do caixa.",
      },
      { property: "og:title", content: "Detalhe do caixa — MARIELA Backoffice" },
      {
        property: "og:description",
        content:
          "Resumo financeiro, movimentações, vendas vinculadas, recebimentos de fiado e conferência do caixa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaixaDetalhePage,
});

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

/** Par rótulo/valor do cabeçalho: valor sempre com hierarquia acima do rótulo. */
function DadoCabecalho({
  rotulo,
  children,
  destaque,
}: {
  rotulo: string;
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <Rotulo>{rotulo}</Rotulo>
      <p
        className={
          destaque
            ? "text-lg font-semibold tabular-nums text-primary"
            : "text-base text-foreground tabular-nums"
        }
      >
        {children}
      </p>
    </div>
  );
}

function ResumoItem({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom?: "entrada" | "saida" | "destaque";
}) {
  const total = tom === "destaque";
  return (
    <div
      className={
        total
          ? "rounded-lg border border-primary/30 bg-primary-soft/40 px-4 py-3"
          : "rounded-lg border border-border/70 px-4 py-3"
      }
    >
      <Rotulo>{rotulo}</Rotulo>
      <p
        className={
          tom === "entrada"
            ? "mt-1 text-xl font-semibold tabular-nums text-success"
            : tom === "saida"
              ? "mt-1 text-xl font-semibold tabular-nums text-destructive"
              : total
                ? "mt-1 text-2xl font-semibold tabular-nums text-primary"
                : "mt-1 text-xl font-semibold tabular-nums"
        }
      >
        {formatarMoeda(valor)}
      </p>
    </div>
  );
}

/** Subtítulo de agrupamento do resumo financeiro. */
function GrupoResumo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-foreground/80">{titulo}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function CaixaDetalhePage() {
  const { id } = Route.useParams();
  const { data: caixa, isPending, isError, error, refetch } = useCaixa(id);
  const entrada = useEntradaCaixa(id);
  const saida = useSaidaCaixa(id);
  const fechar = useFecharCaixa(id);

  const [movimentacao, setMovimentacao] = useState<"entrada" | "saida" | null>(null);
  const [fechamentoAberto, setFechamentoAberto] = useState(false);

  if (isPending) {
    return (
      <Page titulo="Caixa" breadcrumbs={[{ label: "Operação" }, { label: "Caixa" }]}>
        <Skeleton className="h-96 w-full rounded-xl" />
      </Page>
    );
  }

  if (isError || !caixa) {
    return (
      <Page titulo="Caixa" breadcrumbs={[{ label: "Operação" }, { label: "Caixa" }]}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    );
  }

  const aberto = caixa.status === "aberto";
  const diferenca = caixa.fechamento ? situacaoDiferenca(caixa.fechamento.diferenca) : null;

  function registrar(tipo: "entrada" | "saida", payload: SaidaCaixaPayload) {
    const mutation = tipo === "entrada" ? entrada : saida;
    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success(tipo === "entrada" ? "Entrada registrada." : "Saída registrada.");
        setMovimentacao(null);
      },
      onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível concluir a operação.")),
    });
  }

  return (
    <Page
      titulo={caixa.codigo}
      breadcrumbs={[{ label: "Operação" }, { label: "Caixa" }, { label: caixa.codigo }]}
      descricao={
        aberto
          ? "Caixa em operação: registre entradas, saídas e faça a conferência no fechamento."
          : "Caixa fechado: histórico financeiro imutável."
      }
      acoes={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" asChild>
            <Link to="/caixa">
              <ArrowLeft aria-hidden className="size-4" />
              Voltar
            </Link>
          </Button>
          {aberto ? (
            <>
              <Button variant="outline" onClick={() => setMovimentacao("entrada")}>
                <PlusCircle aria-hidden className="size-4" />
                Entrada
              </Button>
              <Button variant="outline" onClick={() => setMovimentacao("saida")}>
                <MinusCircle aria-hidden className="size-4" />
                Saída
              </Button>
              <Button onClick={() => setFechamentoAberto(true)}>Fechar caixa</Button>
            </>
          ) : null}
        </div>
      }
    >
      <Card className="mb-6">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex flex-wrap items-center gap-3 font-display text-2xl">
            <CodigoBadge codigo={caixa.codigo} />
            <Badge variant={VARIANTE_STATUS_CAIXA[caixa.status]}>
              {LABEL_STATUS_CAIXA[caixa.status]}
            </Badge>
          </CardTitle>
          {!aberto ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock aria-hidden className="size-3.5" />
              Movimentações não podem ser alteradas
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <Rotulo>Abertura</Rotulo>
            <p>{formatarDataHora(caixa.abertura.dataHora)}</p>
          </div>
          <div>
            <Rotulo>Responsável</Rotulo>
            <p>{caixa.abertura.responsavelNome}</p>
          </div>
          <div>
            <Rotulo>Valor inicial</Rotulo>
            <p className="tabular-nums">{formatarMoeda(caixa.abertura.valorInicial)}</p>
          </div>
          <div>
            <Rotulo>Saldo esperado</Rotulo>
            <p className="font-medium tabular-nums text-primary">
              {formatarMoeda(caixa.resumo.saldoEsperado)}
            </p>
          </div>
          {caixa.fechamento && diferenca ? (
            <>
              <div>
                <Rotulo>Fechamento</Rotulo>
                <p>{formatarDataHora(caixa.fechamento.dataHora)}</p>
              </div>
              <div>
                <Rotulo>Valor informado</Rotulo>
                <p className="tabular-nums">{formatarMoeda(caixa.fechamento.valorInformado)}</p>
              </div>
              <div>
                <Rotulo>Valor esperado</Rotulo>
                <p className="tabular-nums">{formatarMoeda(caixa.fechamento.valorEsperado)}</p>
              </div>
              <div>
                <Rotulo>{LABEL_DIFERENCA[diferenca]}</Rotulo>
                <p
                  className={
                    diferenca === "conferido"
                      ? "tabular-nums text-emerald-600"
                      : diferenca === "sobra"
                        ? "tabular-nums text-amber-600"
                        : "tabular-nums text-rose-600"
                  }
                >
                  {formatarMoeda(caixa.fechamento.diferenca)}
                </p>
              </div>
              {caixa.fechamento.observacao ? (
                <div className="sm:col-span-2 xl:col-span-4">
                  <Rotulo>Observação do fechamento</Rotulo>
                  <p className="text-foreground/85">{caixa.fechamento.observacao}</p>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Resumo financeiro</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ResumoItem rotulo="Valor de abertura" valor={caixa.resumo.valorAbertura} />
          <ResumoItem rotulo="Total de vendas" valor={caixa.resumo.totalVendas} tom="entrada" />
          <ResumoItem
            rotulo="Recebimentos de parcelas"
            valor={caixa.resumo.recebimentos}
            tom="entrada"
          />
          <ResumoItem
            rotulo="Entradas manuais"
            valor={caixa.resumo.entradasManuais}
            tom="entrada"
          />
          <ResumoItem rotulo="Total de entradas" valor={caixa.resumo.totalEntradas} tom="entrada" />
          <ResumoItem rotulo="Saídas manuais" valor={caixa.resumo.saidasManuais} tom="saida" />
          <ResumoItem rotulo="Devoluções" valor={caixa.resumo.devolucoes} tom="saida" />
          <ResumoItem rotulo="Total de saídas" valor={caixa.resumo.totalSaidas} tom="saida" />
          <ResumoItem rotulo="Saldo esperado" valor={caixa.resumo.saldoEsperado} tom="destaque" />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          <MovimentacoesTabela movimentacoes={caixa.movimentacoes} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Vendas do caixa</CardTitle>
        </CardHeader>
        <CardContent>
          {caixa.vendas.length === 0 ? (
            <EmptyState
              titulo="Nenhuma venda vinculada"
              descricao="As vendas registradas no MARIELA PDV aparecem aqui automaticamente."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left">
                    <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
                      Venda
                    </th>
                    <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
                      Data
                    </th>
                    <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
                      Cliente
                    </th>
                    <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
                      Vendedor
                    </th>
                    <th scope="col" className="text-eyebrow py-2 text-right text-[0.56rem]">
                      Valor
                    </th>
                    <th scope="col" className="text-eyebrow py-2 text-right text-[0.56rem]">
                      Recebido
                    </th>
                    <th scope="col" className="text-eyebrow py-2 text-right text-[0.56rem]">
                      Pendente
                    </th>
                    <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
                      Pagamento
                    </th>
                    <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {caixa.vendas.map((venda) => (
                    <tr key={venda.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2.5">
                        <Link
                          to="/vendas/$id"
                          params={{ id: venda.id }}
                          className="text-primary hover:underline"
                        >
                          {venda.codigo}
                        </Link>
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                        {formatarDataHora(venda.dataVenda)}
                      </td>
                      <td className="py-2.5">{venda.clienteNome}</td>
                      <td className="py-2.5 text-muted-foreground">{venda.vendedorNome}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatarMoeda(venda.valorFinal)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-emerald-600">
                        {formatarMoeda(venda.valorPago)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-amber-600">
                        {formatarMoeda(venda.valorPendente)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{venda.formaPagamento}</td>
                      <td className="py-2.5">
                        <Badge variant={VARIANTE_STATUS_VENDA[venda.status]}>
                          {LABEL_STATUS_VENDA[venda.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-2xl">
            <HandCoins aria-hidden className="size-5 text-primary" />
            Recebimentos de fiado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {caixa.recebimentos.length === 0 ? (
            <EmptyState
              titulo="Nenhum recebimento neste caixa"
              descricao="As baixas de parcelas de vendas em pagamento aparecem aqui."
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {caixa.recebimentos.map((recebimento) => (
                <li key={recebimento.id} className="flex flex-wrap justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      to="/vendas/$id"
                      params={{ id: recebimento.vendaId }}
                      className="text-sm text-primary hover:underline"
                    >
                      {recebimento.vendaCodigo}
                    </Link>
                    <p className="text-sm">{recebimento.clienteNome}</p>
                    <p className="text-xs text-muted-foreground">
                      Parcela {recebimento.parcelaNumero}/{recebimento.parcelaTotal} · Vencimento{" "}
                      {formatarData(recebimento.vencimento)} · Recebido em{" "}
                      {formatarDataHora(recebimento.dataHora)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-emerald-600">
                      + {formatarMoeda(recebimento.valor)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recebimento.formaPagamento} · {recebimento.responsavelNome}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {movimentacao ? (
        <MovimentacaoCaixaDialog
          tipo={movimentacao}
          open
          onOpenChange={(estado) => {
            if (!estado) setMovimentacao(null);
          }}
          saldoDisponivel={caixa.resumo.saldoEsperado}
          salvando={entrada.isPending || saida.isPending}
          onConfirmar={(payload) => registrar(movimentacao, payload)}
        />
      ) : null}

      <FechamentoCaixaDialog
        caixa={caixa}
        open={fechamentoAberto}
        onOpenChange={setFechamentoAberto}
        salvando={fechar.isPending}
        onConfirmar={(payload) =>
          fechar.mutate(payload, {
            onSuccess: () => {
              toast.success(`${caixa.codigo} fechado.`);
              setFechamentoAberto(false);
            },
            onError: (erro) =>
              toast.error(mensagemDeErro(erro, "Não foi possível concluir a operação.")),
          })
        }
      />
    </Page>
  );
}
