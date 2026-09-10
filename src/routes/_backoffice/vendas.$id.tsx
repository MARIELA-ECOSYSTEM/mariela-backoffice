import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Clock3,
  CreditCard,
  HandCoins,
  History,
  Landmark,
  Lock,
  Package,
  User,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { ErrorState } from "@/components/common/states";
import { NotaDemonstracao } from "@/components/common/data-toolbar";
import { CancelamentoDialog } from "@/components/vendas/cancelamento-dialog";
import { RecebimentoDialog } from "@/components/vendas/recebimento-dialog";
import {
  useBaixarParcela,
  useCancelarVenda,
  useReceberPagamento,
  useVenda,
} from "@/hooks/use-vendas";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/utils/format";
import { gerarIdempotencyKey } from "@/utils/idempotencia";
import {
  LABEL_STATUS_VENDA,
  type CancelamentoPayload,
  type RegistrarRecebimentoPayload,
} from "@/types/venda";
import { VARIANTE_STATUS_VENDA, descricaoItemVenda, percentualDesconto } from "@/utils/venda";

export const Route = createFileRoute("/_backoffice/vendas/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Detalhe da venda — MARIELA Backoffice" },
      {
        name: "description",
        content:
          "Detalhamento da venda: itens com preços da época, pagamentos, parcelas, devoluções e histórico.",
      },
      { property: "og:title", content: "Detalhe da venda — MARIELA Backoffice" },
      {
        property: "og:description",
        content:
          "Detalhamento da venda: itens com preços da época, pagamentos, parcelas, devoluções e histórico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendaDetalhePage,
});

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-eyebrow text-[0.58rem]">{children}</p>;
}

function VendaDetalhePage() {
  const { id } = Route.useParams();
  const { data: venda, isPending, isError, error, refetch } = useVenda(id);
  const baixar = useBaixarParcela(id);
  const cancelar = useCancelarVenda(id);
  const receber = useReceberPagamento(id);
  const [cancelamentoAberto, setCancelamentoAberto] = useState(false);
  const [recebimentoAberto, setRecebimentoAberto] = useState(false);

  async function baixarParcela(parcelaId: string, formaPagamento: string) {
    try {
      await baixar.mutateAsync({
        parcelaId,
        payload: { formaPagamento, idempotencyKey: gerarIdempotencyKey() },
      });
      toast.success("Parcela baixada.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível baixar a parcela."));
    }
  }

  async function registrarRecebimento(payload: RegistrarRecebimentoPayload) {
    try {
      await receber.mutateAsync(payload);
      toast.success("Recebimento registrado.");
      setRecebimentoAberto(false);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível registrar o recebimento."));
    }
  }

  async function confirmarCancelamento(payload: CancelamentoPayload) {
    try {
      await cancelar.mutateAsync(payload);
      toast.success(
        payload.tipo === "integral" ? "Venda cancelada." : "Devolução parcial registrada.",
      );
      setCancelamentoAberto(false);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível concluir a operação."));
    }
  }

  return (
    <Page
      titulo="Detalhe da venda"
      breadcrumbs={[
        { label: "Operação" },
        { label: "Vendas", to: "/vendas" },
        { label: venda?.codigo ?? id },
      ]}
      descricao="Visão completa da venda com os preços praticados no momento da operação. Nenhum valor é recalculado."
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/vendas">
              <ArrowLeft aria-hidden className="size-4" />
              Voltar
            </Link>
          </Button>
          {venda && venda.status === "em_pagamento" && venda.valorPendente > 0 ? (
            <Button onClick={() => setRecebimentoAberto(true)}>
              <HandCoins aria-hidden className="size-4" />
              Receber pagamento
            </Button>
          ) : null}
          {venda && venda.status !== "cancelada" ? (
            <Button variant="destructive" onClick={() => setCancelamentoAberto(true)}>
              <Ban aria-hidden className="size-4" />
              Cancelar / devolver
            </Button>
          ) : null}
        </div>
      }
    >
      {isPending ? (
        <div className="space-y-5">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : isError || !venda ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-6 py-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CodigoBadge codigo={venda.codigo} />
                  <Badge variant={VARIANTE_STATUS_VENDA[venda.status]}>
                    {LABEL_STATUS_VENDA[venda.status]}
                  </Badge>
                  <Badge variant="outline">Nº {venda.numero}</Badge>
                </div>
                <p className="font-display text-4xl tabular-nums text-primary">
                  {formatarMoeda(venda.valorFinal)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatarDataHora(venda.dataVenda)} · {venda.totalItens}{" "}
                  {pluralizar(venda.totalItens, "item", "itens")}
                </p>
              </div>

              <div className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <User aria-hidden className="mt-1 size-4 text-muted-foreground/70" />
                  <div>
                    <Rotulo>Cliente</Rotulo>
                    <p className="text-sm">{venda.clienteNome}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <UserRound aria-hidden className="mt-1 size-4 text-muted-foreground/70" />
                  <div>
                    <Rotulo>Vendedor</Rotulo>
                    <p className="text-sm">{venda.vendedorNome}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard aria-hidden className="mt-1 size-4 text-muted-foreground/70" />
                  <div>
                    <Rotulo>Pagamento</Rotulo>
                    <p className="text-sm">
                      {venda.formaPagamento}
                      {venda.totalParcelas > 1 ? ` · ${venda.totalParcelas}x` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Landmark aria-hidden className="mt-1 size-4 text-muted-foreground/70" />
                  <div>
                    <Rotulo>Caixa</Rotulo>
                    <p className="text-sm">{venda.caixaCodigo ?? "—"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {venda.status === "cancelada" ? (
            <NotaDemonstracao>
              Esta venda está <strong>cancelada</strong> e permanece somente para consulta. Vendas
              finalizadas são imutáveis: qualquer correção nasce de um novo evento de devolução.
            </NotaDemonstracao>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 font-display text-2xl">
                    <Package aria-hidden className="size-4 text-primary" />
                    Itens da venda
                  </CardTitle>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock aria-hidden className="size-3" />
                    Snapshot histórico
                  </span>
                </CardHeader>
                <CardContent className="space-y-3">
                  {venda.itens.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-4 rounded-xl border border-border px-3 py-3"
                    >
                      {item.foto ? (
                        <img
                          src={item.foto}
                          alt={`${item.nome} — ${item.cor ?? "cor única"}`}
                          loading="lazy"
                          className="size-16 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="grid size-16 place-items-center rounded-lg bg-primary-soft/50 text-muted-foreground">
                          <Package aria-hidden className="size-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CodigoBadge codigo={item.codVariante ?? item.codProduto} tamanho="xs" />
                          {item.emPromocao ? <Badge variant="outline">Promoção</Badge> : null}
                          {item.quantidadeDevolvida > 0 ? (
                            <Badge variant="destructive">
                              Devolvido {item.quantidadeDevolvida}/{item.quantidade}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">{item.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {descricaoItemVenda(item)} · {item.categoria}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm tabular-nums">
                          {item.quantidade} × {formatarMoeda(item.precoPraticado)}
                        </p>
                        {item.emPromocao ? (
                          <p className="text-xs tabular-nums text-muted-foreground line-through">
                            {formatarMoeda(item.precoOriginal)}
                          </p>
                        ) : null}
                        <p className="text-sm font-medium tabular-nums text-primary">
                          {formatarMoeda(item.subtotal)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {venda.observacao ? (
                    <p className="rounded-xl bg-surface/70 px-3 py-2 text-sm text-muted-foreground">
                      {venda.observacao}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-display text-2xl">
                    <Clock3 aria-hidden className="size-4 text-primary" />
                    Parcelas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {venda.parcelas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Venda à vista, sem parcelas.</p>
                  ) : (
                    venda.parcelas.map((parcela) => (
                      <div
                        key={parcela.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                      >
                        <Badge variant="outline">
                          {parcela.numero}/{parcela.total}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm tabular-nums">{formatarMoeda(parcela.valor)}</p>
                          <p className="text-xs text-muted-foreground">
                            Vencimento {formatarData(parcela.vencimento)}
                            {parcela.pagoEm
                              ? ` · baixada em ${formatarData(parcela.pagoEm)} (${parcela.formaPagamento})`
                              : ""}
                          </p>
                        </div>
                        {parcela.pagoEm ? (
                          <Badge variant="success">Paga</Badge>
                        ) : venda.status === "cancelada" ? (
                          <Badge variant="outline">Cancelada</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={baixar.isPending}
                            onClick={() => void baixarParcela(parcela.id, venda.formaPagamento)}
                          >
                            Dar baixa
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-2xl">Resumo financeiro</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    { label: "Valor bruto", valor: venda.valorBruto },
                    { label: "Desconto promocional", valor: -venda.descontoPromocional },
                    { label: "Desconto do operador", valor: -venda.descontoVenda },
                    { label: "Valor final", valor: venda.valorFinal, destaque: true },
                    { label: "Valor pago", valor: venda.valorPago },
                    { label: "Valor pendente", valor: venda.valorPendente },
                    { label: "Valor devolvido", valor: venda.valorDevolvido },
                  ].map((linha) => (
                    <div
                      key={linha.label}
                      className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
                    >
                      <span className="text-muted-foreground">{linha.label}</span>
                      <span
                        className={
                          linha.destaque
                            ? "font-medium tabular-nums text-primary"
                            : "tabular-nums text-foreground/85"
                        }
                      >
                        {formatarMoeda(linha.valor)}
                      </span>
                    </div>
                  ))}
                  <p className="pt-1 text-xs text-muted-foreground">
                    Desconto total equivale a {percentualDesconto(venda)}% do valor bruto.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-2xl">Pagamentos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {venda.pagamentos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
                  ) : (
                    venda.pagamentos.map((pagamento) => (
                      <div
                        key={pagamento.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-surface/70 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">{pagamento.forma}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatarDataHora(pagamento.dataPagamento)}
                            {pagamento.observacao ? ` · ${pagamento.observacao}` : ""}
                          </p>
                        </div>
                        <span className="text-sm tabular-nums">
                          {formatarMoeda(pagamento.valor)}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {venda.cancelamento ? (
                <Card className="border-destructive/25">
                  <CardHeader>
                    <CardTitle className="font-display text-2xl">
                      {venda.cancelamento.tipo === "integral"
                        ? "Cancelamento"
                        : "Devolução parcial"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{venda.cancelamento.motivo}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatarDataHora(venda.cancelamento.dataHora)} ·{" "}
                      {venda.cancelamento.autor} · devolvido{" "}
                      {formatarMoeda(venda.cancelamento.valorDevolvido)}
                    </p>
                    <ul className="space-y-1">
                      {venda.cancelamento.itens.map((item) => (
                        <li key={item.itemId} className="flex justify-between gap-3 text-xs">
                          <span className="truncate">
                            {item.quantidade}× {item.nome}
                          </span>
                          <span className="tabular-nums">{formatarMoeda(item.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-display text-2xl">
                    <History aria-hidden className="size-4 text-primary" />
                    Histórico
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {venda.historico.map((evento) => (
                    <div key={evento.id} className="border-l-2 border-primary/25 pl-3">
                      <p className="text-sm">{evento.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatarDataHora(evento.dataHora)} · {evento.autor}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <CancelamentoDialog
            venda={venda}
            open={cancelamentoAberto}
            onOpenChange={setCancelamentoAberto}
            salvando={cancelar.isPending}
            onConfirmar={(payload) => void confirmarCancelamento(payload)}
          />

          <RecebimentoDialog
            venda={venda}
            open={recebimentoAberto}
            onOpenChange={setRecebimentoAberto}
            salvando={receber.isPending}
            onConfirmar={(payload) => void registrarRecebimento(payload)}
          />
        </div>
      )}
    </Page>
  );
}
