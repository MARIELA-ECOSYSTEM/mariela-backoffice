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
import { geracaoDaSessao } from "@/services/auth/session";
import { tokenStorage } from "@/services/auth/token-storage";
import {
  carregarOperacao,
  gravarOperacao,
  removerOperacao,
  type CarregamentoOperacao,
} from "@/services/operacoes/registro-operacoes";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/utils/format";
import { gerarIdempotencyKey } from "@/utils/idempotencia";
import {
  avaliarOperacaoPelaChave,
  decidirChave,
  ehResultadoIncerto,
  lerAssinatura,
  marcarIncerta,
  mensagemDeRestauracao,
  payloadDaOperacaoPendente,
  resumoRestauracaoDoEvento,
  type ConclusaoDaOperacao,
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

/** Fase 22.8.9.5 — envio recusado porque a sessão foi encerrada (nada sai por uma sessão antiga). */
const MENSAGEM_SESSAO_ENCERRADA =
  "A sessão foi encerrada antes do envio: a operação não foi enviada. Entre novamente e confira o histórico da venda antes de continuar.";

/** Fase 22.8.9.6 — fail-closed: o registro durável não foi confirmado, então a operação não foi enviada. */
const MENSAGEM_FALHA_PERSISTENCIA =
  "Não foi possível guardar a proteção desta operação neste computador. Por segurança, ela NÃO foi enviada. Tente novamente; se o problema continuar, confira o histórico da venda antes de qualquer outra tentativa.";

function avisoIncerta(
  operacao: OperacaoCancelamento,
  persistida: boolean,
  interrompida = false,
  semIndicador = false,
): AvisoOperacaoCancelamento {
  return {
    vendaId: operacao.vendaId,
    estado: "incerta",
    assinatura: operacao.assinatura,
    incertaDesde: operacao.incertaDesde,
    persistida,
    interrompida,
    semIndicador,
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

/** Fase 22.6.3 — aviso de operação REGISTRADA com efeitos obrigatórios pendentes (chave mantida). */
function avisoEfeitosPendentes(
  operacao: OperacaoCancelamento,
  persistida: boolean,
): AvisoOperacaoCancelamento {
  return {
    vendaId: operacao.vendaId,
    estado: "efeitos_pendentes",
    assinatura: operacao.assinatura,
    incertaDesde: operacao.incertaDesde,
    persistida,
  };
}

/** Motivo enviado ao repetir a operação pendente — o backend ignora o motivo num replay (fora da assinatura). */
const MOTIVO_CONCLUSAO_PENDENTE = "Conclusão do processamento pendente da mesma operação";

/** Fase 22.6.3 — texto ao operador quando a operação foi registrada mas o processamento não terminou. */
function textoEfeitosPendentes(registrado: string, erroOriginal?: string): string {
  return `${registrado}, mas o processamento ainda não terminou${erroOriginal ? ` (“${erroOriginal}”)` : ""}: há efeitos pendentes no servidor (como o lançamento no caixa). Não registre a devolução de novo — use “Concluir processamento”, que reenvia a mesma operação com a mesma chave, sem duplicar nada.`;
}

/**
 * Mensagem de operação ENCERRADA, com o estoque DESTA operação (nunca o resumo da venda inteira). `via` distingue a
 * confirmação pela resposta normal, a confirmação pelo histórico após uma resposta de erro, a confirmação de uma
 * operação pendente ao carregar/atualizar a venda e a conclusão de efeitos pendentes (Fase 22.6.3). Um evento
 * `registrada_sem_rastreio` (anterior ao acompanhamento dos efeitos) nunca vira "sucesso": é aviso.
 */
function notificarConclusao(
  registrado: string,
  conclusao: { tipo: "concluida" | "registrada_sem_rastreio"; evento: EventoCancelamentoLido },
  via: "resposta" | "reconciliacao_apos_erro" | "historico" | "conclusao_pendente",
  erroOriginal?: string,
) {
  const restauracao = mensagemDeRestauracao(resumoRestauracaoDoEvento(conclusao.evento).status);
  const prefixo =
    via === "resposta"
      ? registrado
      : via === "reconciliacao_apos_erro"
        ? `${registrado}: confirmada pelo histórico da venda, embora a resposta do servidor tenha indicado erro${erroOriginal ? ` (“${erroOriginal}”)` : ""}`
        : via === "conclusao_pendente"
          ? `Processamento concluído: ${registrado.toLowerCase()} com todos os efeitos confirmados pelo servidor`
          : `A operação pendente foi confirmada pelo histórico da venda (${registrado.toLowerCase()})`;
  const legado =
    conclusao.tipo === "registrada_sem_rastreio"
      ? "este registro é anterior ao acompanhamento do processamento pelo servidor — confira o caixa e o histórico da venda"
      : null;
  const complementos = [legado, restauracao.texto].filter(Boolean);
  const texto = complementos.length ? `${prefixo}; ${complementos.join("; ")}` : `${prefixo}.`;
  if (restauracao.tom === "sucesso" && !legado) toast.success(texto);
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
   * (refetch sem rede). Uma operação INCERTA (timeout, rede, 502/503/504) também fica registrada, por venda, e é
   * recuperada ao abrir esta página. Recuperar NUNCA dispara requisição.
   *
   * Fase 22.8.9.5 — o registro passou do `sessionStorage` para o armazenamento DURÁVEL
   * (`services/operacoes/registro-operacoes.ts`): sobrevive a fechar o aplicativo, queda do processo e reinício do
   * Windows. A leitura é assíncrona: nenhuma operação é decidida antes de ela terminar (`aguardarCarregamento`).
   */
  const operacaoCancelamentoRef = useRef<OperacaoCancelamento | null>(null);
  /** O registro da operação pendente desta venda está no armazenamento durável (conferido)? */
  const persistidaRef = useRef(false);
  const carregamentoRef = useRef<{
    vendaId: string;
    promessa: Promise<CarregamentoOperacao>;
  } | null>(null);
  const [avisoOperacao, setAvisoOperacao] = useState<AvisoOperacaoCancelamento | null>(null);
  const avisoOperacaoDaVenda = avisoOperacao?.vendaId === id ? avisoOperacao : null;

  /** Aplica o registro lido à memória e ao aviso. */
  function aplicarCarregamento(vendaId: string, leitura: CarregamentoOperacao) {
    if (leitura.estado === "recuperada") {
      const atual = operacaoCancelamentoRef.current;
      // Uma operação incerta desta venda já em memória tem a mesma chave; não há o que trocar.
      if (!(atual && atual.vendaId === vendaId && atual.incerta)) {
        operacaoCancelamentoRef.current = leitura.operacao;
      }
      persistidaRef.current = leitura.duravel;
      // Fase 22.6.1 — `em_andamento` recuperado = a página foi recarregada (ou o app fechado/derrubado) DURANTE o
      // envio. Nada é reenviado; a reconciliação abaixo encerra a pendência se a venda carregada já tiver o evento.
      setAvisoOperacao(
        avisoIncerta(leitura.operacao, leitura.duravel, leitura.origem === "em_andamento"),
      );
    } else if (leitura.estado === "invalida") {
      // Registro ilegível: nenhuma chave é inventada nem reaproveitada; novas operações ficam bloqueadas até o
      // operador conferir o histórico e descartar.
      setAvisoOperacao({ vendaId, estado: "invalida" });
    } else {
      // Nada persistido (ou armazenamento inacessível): mantém só um aviso em memória que seja desta venda.
      setAvisoOperacao((atual) => (atual?.vendaId === vendaId ? atual : null));
    }
  }

  /** A leitura do registro desta venda (a mesma promessa da abertura da página, ou uma nova). */
  function aguardarCarregamento(vendaId: string): Promise<CarregamentoOperacao> {
    const atual = carregamentoRef.current;
    if (atual?.vendaId === vendaId) return atual.promessa;
    const promessa = carregarOperacao(vendaId);
    carregamentoRef.current = { vendaId, promessa };
    return promessa;
  }

  useEffect(() => {
    let ativa = true;
    persistidaRef.current = false;
    const promessa = carregarOperacao(id);
    carregamentoRef.current = { vendaId: id, promessa };
    void promessa.then((leitura) => {
      if (ativa) aplicarCarregamento(id, leitura);
    });
    return () => {
      ativa = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a troca de venda recarrega o registro
  }, [id]);

  /**
   * Fase 22.6.1 — reconciliação CONTÍNUA de uma operação pendente desta venda com os dados carregados (abertura da
   * página, refetch, invalidação): se a venda contiver um evento com EXATAMENTE a chave pendente, a operação FOI
   * registrada (eventos são append-only) — encerra a pendência e avisa o operador. Não envia nada. Ausência da chave
   * nunca libera a operação. Não roda durante um envio (o próprio envio reconcilia ao terminar).
   */
  //
  // Fase 22.6.3 — encontrar o evento NÃO basta: só o indicador `efeitosPosteriores: "concluidos"` (ou um evento
  // anterior ao acompanhamento, `nao_rastreados`) encerra a pendência. Efeitos pendentes → a proteção continua e o aviso
  // passa a dizer que a operação foi registrada mas não terminou; evento sem indicador → continua protegida.
  useEffect(() => {
    if (!venda || cancelandoRef.current) return;
    const pendente = operacaoCancelamentoRef.current;
    if (!pendente || pendente.vendaId !== id || !pendente.incerta) return;
    const conclusao = avaliarOperacaoPelaChave(id, pendente.chave, { ok: true, venda });
    if (conclusao.tipo === "concluida" || conclusao.tipo === "registrada_sem_rastreio") {
      encerrarOperacao(id, pendente.chave);
      notificarConclusao(rotuloDaOperacao(pendente.assinatura), conclusao, "historico");
      return;
    }
    const persistida = persistidaRef.current;
    if (conclusao.tipo === "efeitos_pendentes") {
      setAvisoOperacao((atual) =>
        atual?.vendaId === id && atual.estado === "efeitos_pendentes"
          ? atual
          : avisoEfeitosPendentes(pendente, persistida),
      );
    } else if (conclusao.tipo === "inconclusiva" && conclusao.motivo === "indicador_ausente") {
      setAvisoOperacao((atual) =>
        atual?.vendaId === id && atual.estado === "incerta" && atual.semIndicador
          ? atual
          : avisoIncerta(pendente, persistida, false, true),
      );
    }
  }, [venda, id, avisoOperacao]);

  /**
   * Encerra a operação pendente da venda (conclusão confirmada): memória, aviso e o registro DESTA operação (só se a
   * chave for a mesma — nunca apaga outra operação). Se a remoção falhar, o registro reaparece ao reabrir a venda e a
   * reconciliação o encerra de novo.
   */
  function encerrarOperacao(vendaId: string, chave: string) {
    if (operacaoCancelamentoRef.current?.vendaId === vendaId)
      operacaoCancelamentoRef.current = null;
    persistidaRef.current = false;
    carregamentoRef.current = null;
    void removerOperacao(vendaId, chave);
    setAvisoOperacao((atual) => (atual?.vendaId === vendaId ? null : atual));
  }

  /** Descarte EXPLÍCITO pelo operador (único caminho que remove uma operação não confirmada). */
  async function descartarOperacaoIncerta() {
    const removido = await removerOperacao(id, null);
    if (operacaoCancelamentoRef.current?.vendaId === id) operacaoCancelamentoRef.current = null;
    persistidaRef.current = false;
    carregamentoRef.current = null;
    setAvisoOperacao(null);
    if (!removido) {
      toast.warning(
        "A operação pendente foi descartada nesta página, mas o registro salvo neste computador não pôde ser apagado e pode reaparecer ao reabrir a venda.",
      );
    }
  }

  /**
   * Fase 22.6.3 — a operação continua protegida (chave e assinatura fixadas, registro da venda mantido no
   * armazenamento durável, sem reenvio automático). A mensagem distingue: efeitos pendentes (registrada, não terminou),
   * evento sem indicador, falha da consulta, resultado incerto e erro definitivo sem a chave no histórico.
   * Devolve `true` se o diálogo deve fechar.
   */
  async function manterOperacaoProtegida(
    operacao: OperacaoCancelamento,
    conclusao: ConclusaoDaOperacao,
    registrado: string,
    erro: { valor: unknown } | null,
  ): Promise<boolean> {
    const incerta = marcarIncerta(operacao, new Date());
    operacaoCancelamentoRef.current = incerta;
    // Mesma operação (mesma chave): só atualiza o estado do registro. Falha = o aviso diz que não ficou guardada.
    const persistida = (await gravarOperacao(incerta, "incerta")).ok;
    persistidaRef.current = persistida;
    const mensagemOriginal = erro ? mensagemDeErro(erro.valor, "") : "";
    if (conclusao.tipo === "efeitos_pendentes") {
      setAvisoOperacao(avisoEfeitosPendentes(incerta, persistida));
      toast.warning(textoEfeitosPendentes(registrado, mensagemOriginal || undefined));
      return true;
    }
    const semIndicador =
      conclusao.tipo === "inconclusiva" && conclusao.motivo === "indicador_ausente";
    setAvisoOperacao(avisoIncerta(incerta, persistida, false, semIndicador));
    if (semIndicador) {
      toast.warning(
        "A operação aparece no histórico da venda, mas não foi possível confirmar se o processamento dela terminou. Ela continua protegida (a mesma chave será reutilizada); confira o histórico antes de qualquer nova tentativa.",
      );
      return true;
    }
    if (conclusao.tipo === "inconclusiva" && conclusao.motivo === "consulta_falhou") {
      toast.warning(
        "Não foi possível confirmar se a operação foi registrada: a consulta da venda falhou. Confira o histórico da venda antes de tentar novamente.",
      );
      return true;
    }
    if (!erro || ehResultadoIncerto(erro.valor) || conclusao.tipo === "inconclusiva") {
      toast.warning(
        "Não foi possível confirmar se a operação foi registrada. Confira o histórico da venda antes de tentar novamente.",
      );
      return true;
    }
    // Erro definitivo e a venda relida não tem a chave: mantém o feedback do backend; o diálogo continua aberto
    // para reenviar EXATAMENTE a mesma operação (mesma chave — replay seguro).
    toast.error(
      `${mensagemDeErro(erro.valor, "Não foi possível concluir a operação.")} A operação não aparece no histórico da venda e continua protegida: reenviar exatamente a mesma operação é seguro.`,
    );
    return false;
  }

  /** Fase 22.6.3 — repete a operação registrada com efeitos pendentes: mesma assinatura ⇒ mesma chave. */
  function concluirOperacaoPendente() {
    const pendente = operacaoCancelamentoRef.current;
    if (!pendente || pendente.vendaId !== id) return;
    const payload = payloadDaOperacaoPendente(pendente.assinatura, MOTIVO_CONCLUSAO_PENDENTE);
    if (!payload) {
      toast.error(
        "A operação pendente não pôde ser lida para ser reenviada. Confira o histórico da venda.",
      );
      return;
    }
    void confirmarCancelamento(payload, "conclusao_pendente");
  }

  async function confirmarCancelamento(
    payloadDoDialogo: CancelamentoPayload,
    origem: "dialogo" | "conclusao_pendente" = "dialogo",
  ) {
    if (cancelandoRef.current) return;
    cancelandoRef.current = true;
    try {
      await enviarCancelamento(payloadDoDialogo, origem);
    } finally {
      cancelandoRef.current = false;
    }
  }

  async function enviarCancelamento(
    payloadDoDialogo: CancelamentoPayload,
    origem: "dialogo" | "conclusao_pendente",
  ) {
    // Fase 22.8.9.5 — a sessão que o operador está usando AGORA. Se ela for encerrada (logout, rejeição definitiva)
    // antes do envio, nada é enviado: uma operação pendente nunca sai por uma sessão antiga.
    const geracao = geracaoDaSessao();
    const sessaoVigente = () => geracaoDaSessao() === geracao && tokenStorage.get() !== null;
    // Fase 22.8.9.5 — nenhuma chave é decidida antes de o registro durável desta venda ser lido: uma operação incerta
    // gravada antes (inclusive em outra abertura do aplicativo) nunca é trocada por uma chave nova.
    const carregamento = await aguardarCarregamento(id);
    if (carregamento.estado === "recuperada") {
      const atual = operacaoCancelamentoRef.current;
      if (!(atual && atual.vendaId === id && atual.incerta)) {
        operacaoCancelamentoRef.current = carregamento.operacao;
        persistidaRef.current = carregamento.duravel;
      }
    }
    if (carregamento.estado === "invalida" || avisoOperacaoDaVenda?.estado === "invalida") {
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
      if (avisoOperacaoDaVenda?.estado === "efeitos_pendentes") {
        toast.error(
          "Há uma operação desta venda já registrada cujo processamento ainda não terminou. Conclua-a (“Concluir processamento”) antes de registrar uma operação diferente.",
        );
        return;
      }
      toast.error(
        "Há uma operação anterior desta venda sem confirmação. Reenvie exatamente a mesma operação ou, depois de conferir o histórico, descarte-a antes de registrar uma operação diferente.",
      );
      return;
    }
    if (!sessaoVigente()) {
      toast.error(MENSAGEM_SESSAO_ENCERRADA);
      return;
    }
    // Fase 22.6.1 (A3) — a operação é gravada ANTES do envio (`em_andamento`; uma já incerta continua `incerta`):
    // um reload, fechamento ou queda do aplicativo durante a requisição não perde a chave. Fase 22.8.9.5 — a gravação
    // é durável e conferida. Fase 22.8.9.6 — se ela não for confirmada, a operação NÃO é enviada (fail-closed).
    const operacao: OperacaoCancelamento = {
      ...decisao.operacao,
      incertaDesde: decisao.operacao.incertaDesde ?? new Date().toISOString(),
    };
    const gravacao = await gravarOperacao(operacao, operacao.incerta ? "incerta" : "em_andamento");
    if (!gravacao.ok && gravacao.motivo === "conflito") {
      // Há OUTRA operação desta venda registrada neste computador (gravada fora desta página): nada é enviado e ela
      // passa a ser a operação pendente exibida.
      carregamentoRef.current = null;
      aplicarCarregamento(id, await aguardarCarregamento(id));
      toast.error(
        "Há outra operação desta venda registrada neste computador e ainda sem confirmação. Nada foi enviado: confira o histórico e reenvie a mesma operação ou descarte-a.",
      );
      return;
    }
    if (!gravacao.ok) {
      // Fase 22.8.9.6 — FAIL-CLOSED: sem o registro durável confirmado (gravado e relido), nada é enviado. A memória
      // e qualquer registro anterior ficam como estavam (uma operação incerta continua com a MESMA chave); o diálogo
      // continua aberto para uma nova tentativa, que tenta gravar de novo.
      toast.error(MENSAGEM_FALHA_PERSISTENCIA);
      return;
    }
    operacaoCancelamentoRef.current = operacao;
    persistidaRef.current = true;
    if (!sessaoVigente()) {
      // A sessão terminou enquanto o registro era gravado: nada é enviado; a operação continua guardada como
      // pendente (pode ser conferida e reenviada, ou descartada, depois de entrar de novo).
      toast.error(MENSAGEM_SESSAO_ENCERRADA);
      return;
    }
    const payload: CancelamentoPayload = { ...payloadDoDialogo, idempotencyKey: operacao.chave };
    const registrado = rotuloDaOperacao(operacao.assinatura);
    try {
      const resultado = await cancelar.mutateAsync(payload);
      // Fase 22.6.3 — resposta de sucesso também passa pelo indicador: só `concluidos` (ou evento anterior ao
      // acompanhamento) encerra; sem indicador (backend antigo) ou pendente, a operação continua protegida.
      const conclusao = avaliarOperacaoPelaChave(operacao.vendaId, operacao.chave, {
        ok: true,
        venda: resultado,
      });
      if (conclusao.tipo === "concluida" || conclusao.tipo === "registrada_sem_rastreio") {
        encerrarOperacao(operacao.vendaId, operacao.chave);
        notificarConclusao(
          registrado,
          conclusao,
          origem === "conclusao_pendente" ? "conclusao_pendente" : "resposta",
        );
        setCancelamentoAberto(false);
        return;
      }
      if (await manterOperacaoProtegida(operacao, conclusao, registrado, null))
        setCancelamentoAberto(false);
    } catch (err) {
      // Fase 22.6.1 (A2) — QUALQUER falha: o backend pode ter gravado o evento e respondido erro depois (caixa
      // fechado no meio, agregados, auditoria…). Relê a venda e procura a chave EXATA enviada.
      const leitura = await lerVendaParaReconciliacao(operacao.vendaId);
      void queryClient.invalidateQueries({ queryKey: vendasKeys.todas });
      const conclusao = avaliarOperacaoPelaChave(operacao.vendaId, operacao.chave, leitura);
      if (conclusao.tipo === "concluida" || conclusao.tipo === "registrada_sem_rastreio") {
        encerrarOperacao(operacao.vendaId, operacao.chave);
        notificarConclusao(
          registrado,
          conclusao,
          "reconciliacao_apos_erro",
          mensagemDeErro(err, ""),
        );
        setCancelamentoAberto(false);
        return;
      }
      // Não concluída (efeitos pendentes, evento sem indicador, consulta inconclusiva OU chave ausente neste momento —
      // que não prova nada): a operação fica PROTEGIDA, sem chave nova e sem reenvio automático.
      if (await manterOperacaoProtegida(operacao, conclusao, registrado, { valor: err }))
        setCancelamentoAberto(false);
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
              onDescartar={() => void descartarOperacaoIncerta()}
              onConcluir={concluirOperacaoPendente}
              concluindo={cancelar.isPending}
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
            onDescartarOperacaoIncerta={() => void descartarOperacaoIncerta()}
            onConcluirOperacaoPendente={concluirOperacaoPendente}
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
