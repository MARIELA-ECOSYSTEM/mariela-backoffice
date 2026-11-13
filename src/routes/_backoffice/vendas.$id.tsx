import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  AvisoOperacaoIncerta,
  CancelamentoDialog,
  type AvisoOperacaoCancelamento,
} from "@/components/vendas/cancelamento-dialog";
import { RecebimentoDialog } from "@/components/vendas/recebimento-dialog";
import {
  useBaixarParcela,
  useCancelarVenda,
  useReceberPagamento,
  useVenda,
  vendasKeys,
} from "@/hooks/use-vendas";
import { mensagemDeErro } from "@/services/api/client";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/utils/format";
import { gerarIdempotencyKey } from "@/utils/idempotencia";
import {
  decidirChave,
  ehResultadoIncerto,
  eventoComChave,
  lerAssinatura,
  lerOperacaoIncerta,
  marcarIncerta,
  mensagemDeRestauracao,
  persistirOperacao,
  reconciliarPelaChave,
  removerOperacaoIncerta,
  resumoRestauracaoDoEvento,
  type EventoCancelamentoLido,
  type LeituraVendaParaReconciliacao,
  type OperacaoCancelamento,
  type StatusRestauracaoOperacao,
} from "@/utils/operacao-cancelamento";
import { vendasApi } from "@/services/api/vendas.api";
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
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

/**
 * Linha do resumo financeiro (apresentação apenas — nenhum valor é recalculado).
 * `tom` apenas escolhe a semântica visual do valor já fornecido.
 */
function ResumoLinha({
  rotulo,
  valor,
  tom,
  sinal,
}: {
  rotulo: string;
  valor: number;
  tom?: "total" | "desconto" | "pendente" | "pago";
  sinal?: "−";
}) {
  const classeValor =
    tom === "total"
      ? "text-2xl font-semibold tabular-nums text-primary"
      : tom === "desconto"
        ? "text-base font-medium tabular-nums text-destructive"
        : tom === "pendente"
          ? "text-base font-semibold tabular-nums text-warning"
          : tom === "pago"
            ? "text-base font-medium tabular-nums text-success"
            : "text-base tabular-nums text-foreground/85";

  return (
    <div
      className={
        tom === "total"
          ? "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-soft/40 px-3 py-2.5"
          : "flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
      }
    >
      <span
        className={
          tom === "total" ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"
        }
      >
        {rotulo}
      </span>
      <span className={classeValor}>
        {sinal ? `${sinal} ` : ""}
        {formatarMoeda(valor)}
      </span>
    </div>
  );
}

// ─── Fase 22.6.1 — apoio ao cancelamento/devolução (fora do componente: sem estado) ────────────────────────────────

function avisoIncerta(
  operacao: OperacaoCancelamento,
  persistida: boolean,
  interrompida = false,
): AvisoOperacaoCancelamento {
  return {
    vendaId: operacao.vendaId,
    estado: "incerta",
    assinatura: operacao.assinatura,
    incertaDesde: operacao.incertaDesde,
    persistida,
    interrompida,
  };
}

function rotuloDaOperacao(assinatura: string): string {
  return lerAssinatura(assinatura)?.tipo === "integral"
    ? "Venda cancelada"
    : "Devolução parcial registrada";
}

/** Lê a venda para reconciliar; qualquer falha vira `{ ok: false }` (inconclusivo — nunca "não registrada"). */
async function lerVendaParaReconciliacao(vendaId: string): Promise<LeituraVendaParaReconciliacao> {
  try {
    return { ok: true, venda: await vendasApi.obter(vendaId) };
  } catch {
    return { ok: false };
  }
}

/**
 * Mensagem de operação registrada, com o estoque DESTA operação (nunca o resumo da venda inteira). `via` distingue a
 * confirmação pela resposta normal, a confirmação pelo histórico após uma resposta de erro e a confirmação de uma
 * operação pendente ao carregar/atualizar a venda.
 */
function notificarConclusao(
  registrado: string,
  evento: EventoCancelamentoLido | null,
  via: "resposta" | "reconciliacao_apos_erro" | "historico",
  erroOriginal?: string,
) {
  const restauracao = mensagemDeRestauracao(resumoRestauracaoDoEvento(evento).status);
  const prefixo =
    via === "resposta"
      ? registrado
      : via === "reconciliacao_apos_erro"
        ? `${registrado}: confirmada pelo histórico da venda, embora a resposta do servidor tenha indicado erro${erroOriginal ? ` (“${erroOriginal}”)` : ""}`
        : `A operação pendente foi confirmada pelo histórico da venda (${registrado.toLowerCase()})`;
  const texto = restauracao.texto ? `${prefixo}; ${restauracao.texto}` : `${prefixo}.`;
  if (restauracao.tom === "sucesso") toast.success(texto);
  else toast.warning(texto);
}

const SELO_RESTAURACAO: Partial<
  Record<
    StatusRestauracaoOperacao,
    { texto: string; variante: "success" | "warning" | "destructive" }
  >
> = {
  concluida: { texto: "Estoque devolvido", variante: "success" },
  pendente: { texto: "Estoque: devolução pendente", variante: "warning" },
  falha_recuperavel: { texto: "Estoque: falha, nova tentativa automática", variante: "warning" },
  requer_intervencao: { texto: "Estoque: requer intervenção", variante: "destructive" },
  indeterminado: { texto: "Estoque: situação indeterminada", variante: "warning" },
};

function VendaDetalhePage() {
  const { id } = Route.useParams();
  const { data: venda, isPending, isError, error, refetch } = useVenda(id);
  const baixar = useBaixarParcela(id);
  const cancelar = useCancelarVenda(id);
  const receber = useReceberPagamento(id);
  const queryClient = useQueryClient();
  const [cancelamentoAberto, setCancelamentoAberto] = useState(false);
  const [recebimentoAberto, setRecebimentoAberto] = useState(false);
  // Guardas síncronas via ref — Etapa 20.20. `baixarParcela` NÃO recebeu
  // guarda: o backend (vendas.service.ts `baixarParcela`) marca `parcela
  // .pagoEm` dentro do mesmo `salvarComRetentativa` (retry com concorrência
  // otimista do Mongoose, `optimisticConcurrency: true` no schema) e relê
  // esse campo a cada tentativa — uma parcela só pode ser baixada uma única
  // vez, com ou sem `idempotencyKey` e mesmo sob duas requisições
  // concorrentes com chaves diferentes. Já `registrarRecebimento` e
  // `confirmarCancelamento` (devolução parcial) NÃO têm um invariante
  // equivalente para valores/quantidades PARCIAIS: se o usuário recebe/
  // devolve menos que o saldo/quantidade total, o saldo remanescente após a
  // 1ª chamada ainda é suficiente para a 2ª chamada (com sua própria
  // idempotencyKey diferente) passar pelas mesmas validações e duplicar o
  // efeito financeiro/de estoque — confirmado por leitura de
  // `vendas.service.ts` (`receberPagamento`, `cancelar` caminho parcial),
  // não por reprodução dinâmica (proibida sem fabricar dados financeiros).
  const registrandoRecebimentoRef = useRef(false);
  const cancelandoRef = useRef(false);

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
    if (registrandoRecebimentoRef.current) return;
    registrandoRecebimentoRef.current = true;
    try {
      await receber.mutateAsync(payload);
      toast.success("Recebimento registrado.");
      setRecebimentoAberto(false);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível registrar o recebimento."));
    } finally {
      registrandoRecebimentoRef.current = false;
    }
  }

  /**
   * Fase 60.4.3.4.18 + 22.5.1 + 22.5.2 — UMA `idempotencyKey` por operação de cancelamento/devolução, reusada em
   * toda nova tentativa da MESMA operação, para o backend reconhecer a repetição como replay (sem segunda devolução).
   * Regras em `utils/operacao-cancelamento.ts` (`decidirChave`).
   *
   * Fica na página, e não no `CancelamentoDialog`, porque o diálogo desmonta quando a consulta da venda entra em erro
   * (refetch sem rede). Uma operação INCERTA (timeout, rede, 502/503/504) também vai para o `sessionStorage` da aba,
   * por venda, e é recuperada ao abrir esta página — sobrevive a reload. Recuperar NUNCA dispara requisição.
   */
  const operacaoCancelamentoRef = useRef<OperacaoCancelamento | null>(null);
  const [avisoOperacao, setAvisoOperacao] = useState<AvisoOperacaoCancelamento | null>(null);
  const avisoOperacaoDaVenda = avisoOperacao?.vendaId === id ? avisoOperacao : null;

  useEffect(() => {
    const leitura = lerOperacaoIncerta(id);
    if (leitura.estado === "recuperada") {
      const atual = operacaoCancelamentoRef.current;
      // Uma operação incerta desta venda já em memória tem a mesma chave; não há o que trocar.
      if (!(atual && atual.vendaId === id && atual.incerta)) {
        operacaoCancelamentoRef.current = leitura.operacao;
      }
      // Fase 22.6.1 — `em_andamento` recuperado = a página foi recarregada/fechada DURANTE o envio. Nada é reenviado;
      // a reconciliação abaixo encerra a pendência se a venda carregada já tiver o evento com esta chave.
      setAvisoOperacao(avisoIncerta(leitura.operacao, true, leitura.origem === "em_andamento"));
    } else if (leitura.estado === "invalida") {
      // Registro ilegível: nenhuma chave é inventada nem reaproveitada; novas operações ficam bloqueadas até o
      // operador conferir o histórico e descartar.
      setAvisoOperacao({ vendaId: id, estado: "invalida" });
    } else {
      // Nada persistido (ou armazenamento inacessível): mantém só um aviso em memória que seja desta venda.
      setAvisoOperacao((atual) => (atual?.vendaId === id ? atual : null));
    }
  }, [id]);

  /**
   * Fase 22.6.1 — reconciliação CONTÍNUA de uma operação pendente desta venda com os dados carregados (abertura da
   * página, refetch, invalidação): se a venda contiver um evento com EXATAMENTE a chave pendente, a operação FOI
   * registrada (eventos são append-only) — encerra a pendência e avisa o operador. Não envia nada. Ausência da chave
   * nunca libera a operação. Não roda durante um envio (o próprio envio reconcilia ao terminar).
   */
  useEffect(() => {
    if (!venda || cancelandoRef.current) return;
    const pendente = operacaoCancelamentoRef.current;
    if (!pendente || pendente.vendaId !== id || !pendente.incerta) return;
    const evento = eventoComChave(venda, pendente.chave);
    if (!evento) return;
    operacaoCancelamentoRef.current = null;
    removerOperacaoIncerta(id);
    setAvisoOperacao((atual) => (atual?.vendaId === id ? null : atual));
    notificarConclusao(rotuloDaOperacao(pendente.assinatura), evento, "historico");
  }, [venda, id, avisoOperacao]);

  /** Encerra a operação pendente da venda (registro confirmado): memória, registro DESTA venda e aviso. */
  function encerrarOperacao(vendaId: string) {
    if (operacaoCancelamentoRef.current?.vendaId === vendaId)
      operacaoCancelamentoRef.current = null;
    removerOperacaoIncerta(vendaId);
    setAvisoOperacao((atual) => (atual?.vendaId === vendaId ? null : atual));
  }

  function descartarOperacaoIncerta() {
    const removido = removerOperacaoIncerta(id);
    if (operacaoCancelamentoRef.current?.vendaId === id) operacaoCancelamentoRef.current = null;
    setAvisoOperacao(null);
    if (!removido && lerOperacaoIncerta(id).estado !== "indisponivel") {
      toast.warning(
        "A operação pendente foi descartada nesta página, mas o registro salvo no navegador não pôde ser apagado e pode reaparecer ao recarregar.",
      );
    }
  }

  async function confirmarCancelamento(payloadDoDialogo: CancelamentoPayload) {
    if (cancelandoRef.current) return;
    if (avisoOperacaoDaVenda?.estado === "invalida") {
      toast.error(
        "Há um registro ilegível de operação anterior sem confirmação. Confira o histórico da venda e descarte-o antes de registrar uma nova operação.",
      );
      return;
    }
    const decisao = decidirChave({
      atual: operacaoCancelamentoRef.current,
      vendaId: id,
      payload: payloadDoDialogo,
      eventos: venda?.cancelamentos.length ?? 0,
      gerarChave: gerarIdempotencyKey,
    });
    if (decisao.tipo === "bloqueada") {
      toast.error(
        "Há uma operação anterior desta venda sem confirmação. Reenvie exatamente a mesma operação ou, depois de conferir o histórico, descarte-a antes de registrar uma operação diferente.",
      );
      return;
    }
    cancelandoRef.current = true;
    // Fase 22.6.1 (A3) — a operação é gravada ANTES do envio (`em_andamento`; uma já incerta continua `incerta`):
    // um reload/fechamento durante a requisição não perde a chave. Sem armazenamento, a proteção fica só em memória
    // e o operador é avisado de que ela não sobrevive a um reload.
    const operacao: OperacaoCancelamento = {
      ...decisao.operacao,
      incertaDesde: decisao.operacao.incertaDesde ?? new Date().toISOString(),
    };
    operacaoCancelamentoRef.current = operacao;
    if (!persistirOperacao(operacao, operacao.incerta ? "incerta" : "em_andamento")) {
      toast.warning(
        "Não foi possível guardar a proteção desta operação no navegador: se a página for recarregada ou fechada durante o envio, a identificação da operação se perde.",
      );
    }
    const payload: CancelamentoPayload = { ...payloadDoDialogo, idempotencyKey: operacao.chave };
    const registrado = rotuloDaOperacao(operacao.assinatura);
    try {
      const resultado = await cancelar.mutateAsync(payload);
      // Operação confirmada pelo backend (registro novo ou replay): limpa memória e o registro DESTA venda; a próxima
      // operação recebe chave nova.
      encerrarOperacao(operacao.vendaId);
      notificarConclusao(registrado, eventoComChave(resultado, operacao.chave), "resposta");
      setCancelamentoAberto(false);
    } catch (err) {
      // Fase 22.6.1 (A2) — QUALQUER falha: o backend pode ter gravado o evento e respondido erro depois (caixa
      // fechado no meio, agregados, auditoria…). Relê a venda e procura a chave EXATA enviada.
      const leitura = await lerVendaParaReconciliacao(operacao.vendaId);
      void queryClient.invalidateQueries({ queryKey: vendasKeys.todas });
      const reconciliacao = reconciliarPelaChave(operacao.vendaId, operacao.chave, leitura);
      if (reconciliacao.tipo === "registrada") {
        encerrarOperacao(operacao.vendaId);
        notificarConclusao(
          registrado,
          reconciliacao.evento,
          "reconciliacao_apos_erro",
          mensagemDeErro(err, ""),
        );
        setCancelamentoAberto(false);
        return;
      }
      // Não confirmada (consulta inconclusiva OU chave ausente neste momento — que não prova nada): a operação fica
      // PROTEGIDA — chave e assinatura fixadas e persistidas, sem chave nova e sem reenvio automático.
      const incerta = marcarIncerta(operacao, new Date());
      operacaoCancelamentoRef.current = incerta;
      setAvisoOperacao(avisoIncerta(incerta, persistirOperacao(incerta, "incerta")));
      if (ehResultadoIncerto(err) || reconciliacao.tipo === "inconclusiva") {
        toast.warning(
          "Não foi possível confirmar se a operação foi registrada. Confira o histórico da venda antes de tentar novamente.",
        );
        setCancelamentoAberto(false);
      } else {
        // Erro definitivo e a venda relida não tem a chave: mantém o feedback do backend; o diálogo continua aberto
        // para reenviar EXATAMENTE a mesma operação (mesma chave — replay seguro).
        toast.error(
          `${mensagemDeErro(err, "Não foi possível concluir a operação.")} A operação não aparece no histórico da venda e continua protegida: reenviar exatamente a mesma operação é seguro.`,
        );
      }
    } finally {
      cancelandoRef.current = false;
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
            <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
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
              <div className="min-w-0 space-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CodigoBadge codigo={venda.codigo} />
                  <Badge variant={VARIANTE_STATUS_VENDA[venda.status]}>
                    {LABEL_STATUS_VENDA[venda.status]}
                  </Badge>
                  <Badge variant="outline">Nº {venda.numero}</Badge>
                </div>
                <p className="font-display text-3xl tabular-nums text-primary sm:text-4xl">
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

          {avisoOperacaoDaVenda ? (
            <AvisoOperacaoIncerta
              aviso={avisoOperacaoDaVenda}
              venda={venda}
              onDescartar={descartarOperacaoIncerta}
            />
          ) : null}

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
                        ) : venda.valorPendente <= 0 ? (
                          // Etapa 18.31 — venda pode quitar o saldo inteiro via
                          // "Receber pagamento" sem baixar cada parcela formal
                          // individualmente; sem isso, o botão "Dar baixa" ficava
                          // visível numa venda já concluída e sempre falhava.
                          <Badge variant="success">Quitada</Badge>
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
                <CardContent className="space-y-3 text-sm">
                  <div className="space-y-2">
                    <ResumoLinha rotulo="Valor bruto" valor={venda.valorBruto} />
                    <ResumoLinha
                      rotulo="Desconto promocional"
                      valor={venda.descontoPromocional}
                      tom="desconto"
                      sinal="−"
                    />
                    <ResumoLinha
                      rotulo="Desconto do operador"
                      valor={venda.descontoVenda}
                      tom="desconto"
                      sinal="−"
                    />
                  </div>

                  <ResumoLinha rotulo="Valor final" valor={venda.valorFinal} tom="total" />

                  <div className="space-y-2">
                    <ResumoLinha rotulo="Valor pago" valor={venda.valorPago} tom="pago" />
                    <ResumoLinha
                      rotulo="Valor pendente"
                      valor={venda.valorPendente}
                      {...(venda.valorPendente > 0 ? { tom: "pendente" as const } : {})}
                    />
                    <ResumoLinha rotulo="Valor devolvido" valor={venda.valorDevolvido} />
                  </div>
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

              {venda.cancelamentos.map((cancelamento) => {
                const selo = SELO_RESTAURACAO[resumoRestauracaoDoEvento(cancelamento).status];
                return (
                  <Card key={cancelamento.id} className="border-destructive/25">
                    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                      <CardTitle className="font-display text-2xl">
                        {cancelamento.tipo === "integral" ? "Cancelamento" : "Devolução parcial"}
                      </CardTitle>
                      {/* Fase 22.6.1 — estado do estoque DESTE evento (nunca o resumo da venda inteira). */}
                      {selo ? <Badge variant={selo.variante}>{selo.texto}</Badge> : null}
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-muted-foreground">{cancelamento.motivo}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatarDataHora(cancelamento.dataHora)} · {cancelamento.autor} · devolvido{" "}
                        {formatarMoeda(cancelamento.valorDevolvido)}
                      </p>
                      <ul className="space-y-1">
                        {cancelamento.itens.map((item) => (
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
                );
              })}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-display text-2xl">
                    <History aria-hidden className="size-4 text-primary" />
                    Histórico
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {venda.historico.map((evento, index) => (
                    // Etapa 18.31 — o backend real nunca envia `id` em eventos de
                    // histórico (`EventoVenda.id` é só um resquício do mock); usar
                    // `evento.id` aqui deixava TODOS os itens com a mesma key
                    // (undefined).
                    <div
                      key={evento.id ?? `${evento.dataHora}-${index}`}
                      className="border-l-2 border-primary/25 pl-3"
                    >
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
            avisoOperacao={avisoOperacaoDaVenda}
            onDescartarOperacaoIncerta={descartarOperacaoIncerta}
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
