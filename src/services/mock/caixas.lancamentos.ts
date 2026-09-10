import type { Caixa, MovimentacaoCaixa, ResumoCaixa } from "@/types/caixa";
import type { ParcelaVenda, VendaDetalhe } from "@/types/venda";
import { agora, db, gerarId } from "./db";

/**
 * Lançamentos financeiros do caixa.
 *
 * Vive separado do handler HTTP porque o módulo de VENDAS também precisa
 * lançar no caixa (baixa de parcela e cancelamento) — exatamente como o
 * serviço de vendas do NestJS chama `CaixasService.registrarMovimentoDeVenda`.
 */

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

export function movimentacoesDoCaixa(caixaId: string): MovimentacaoCaixa[] {
  return db.caixasMovimentacoes
    .filter((item) => item.caixaId === caixaId)
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora));
}

/** Resumo SEMPRE derivado das movimentações — nunca de um campo editável. */
export function calcularResumoCaixa(caixa: Caixa): ResumoCaixa {
  const movimentacoes = db.caixasMovimentacoes.filter((item) => item.caixaId === caixa.id);
  const somar = (tipos: MovimentacaoCaixa["tipo"][]) =>
    arredondar(
      movimentacoes
        .filter((item) => tipos.includes(item.tipo))
        .reduce((total, item) => total + item.valor, 0),
    );

  const totalVendas = somar(["venda"]);
  const recebimentos = 0;
  const entradasManuais = somar(["injecao"]);
  const saidasManuais = somar(["sangria"]);
  const devolucoes = somar(["cancelamento"]);
  const totalEntradas = arredondar(totalVendas + recebimentos + entradasManuais);
  const totalSaidas = arredondar(saidasManuais + devolucoes);

  return {
    valorAbertura: caixa.abertura.valorInicial,
    totalVendas,
    recebimentos,
    entradasManuais,
    totalEntradas,
    saidasManuais,
    devolucoes,
    totalSaidas,
    saldoEsperado: arredondar(caixa.abertura.valorInicial + totalEntradas - totalSaidas),
    quantidadeVendas: new Set(
      movimentacoes.filter((item) => item.tipo === "venda").map((item) => item.vendaId),
    ).size,
    quantidadeMovimentacoes: movimentacoes.length,
  };
}

/** Reaplica o resumo de todos os caixas (papel do serviço no NestJS). */
export function sincronizarResumosCaixas(): void {
  db.caixas.forEach((caixa) => {
    caixa.resumo = calcularResumoCaixa(caixa);
  });
}

export function caixaAberto(): Caixa | null {
  return db.caixas.find((caixa) => caixa.status === "aberto") ?? null;
}

/** Caixa que deve receber um lançamento automático de venda/parcela/devolução. */
function caixaDestino(): Caixa | null {
  return caixaAberto();
}

export function registrarMovimentacao(
  entrada: Omit<MovimentacaoCaixa, "id" | "caixaId"> & { caixaId?: string },
): MovimentacaoCaixa | null {
  const caixa = entrada.caixaId
    ? db.caixas.find((item) => item.id === entrada.caixaId)
    : caixaDestino();
  if (!caixa || caixa.status === "fechado") return null;

  const movimentacao: MovimentacaoCaixa = {
    ...entrada,
    id: gerarId("mov"),
    caixaId: caixa.id,
    valor: arredondar(entrada.valor),
  };
  db.caixasMovimentacoes.push(movimentacao);
  caixa.resumo = calcularResumoCaixa(caixa);
  return movimentacao;
}

/**
 * Baixa de parcela feita no backoffice → movimento `tipo: "venda"` no caixa
 * aberto (Etapa 18.6: o Caixa não distingue mais "recebimento de parcela" de
 * "venda" — ver `MovimentosCaixaRepository`/`caixas.constants.ts` no
 * backend). Quando não existe caixa aberto, nada é lançado (o valor entrará
 * no próximo caixa, pela regra de não alterar histórico já fechado).
 */
export function registrarRecebimentoParcela(
  venda: VendaDetalhe,
  parcela: ParcelaVenda,
  formaPagamento: string,
): void {
  registrarMovimentacao({
    dataHora: parcela.pagoEm ?? agora(),
    tipo: "venda",
    origem: "venda",
    descricao: `Recebimento da parcela ${parcela.numero}/${parcela.total} · ${venda.clienteNome}`,
    referencia: venda.codigo,
    vendaId: venda.id,
    vendaCodigo: venda.codigo,
    formaPagamento,
    valor: parcela.valor,
    sentido: "entrada",
    observacao: `Baixa registrada no backoffice`,
    motivo: null,
  });
}

/**
 * Recebimento posterior (Etapa 18.29) → mesmo tratamento de
 * `registrarRecebimentoParcela`: lança `tipo: "venda"` no caixa aberto, mas
 * sem depender de uma parcela formal (cobre valor livre, parcial ou total,
 * contra o saldo pendente da venda).
 */
export function registrarRecebimentoPosterior(
  venda: VendaDetalhe,
  valor: number,
  formaPagamento: string,
  dataHora: string,
): void {
  registrarMovimentacao({
    dataHora,
    tipo: "venda",
    origem: "venda",
    descricao: `Recebimento posterior · ${venda.clienteNome}`,
    referencia: venda.codigo,
    vendaId: venda.id,
    vendaCodigo: venda.codigo,
    formaPagamento,
    valor,
    sentido: "entrada",
    observacao: "Recebimento registrado no backoffice",
    motivo: null,
  });
}

/**
 * Cancelamento/devolução (total ou parcial) → sempre `tipo: "cancelamento"`
 * no caixa aberto, limitado ao valor efetivamente recebido (Etapa 18.6: o
 * Caixa não distingue mais os dois casos — a distinção continua só na
 * descrição, mesma regra do backend real).
 */
export function registrarDevolucao(
  venda: VendaDetalhe,
  tipo: "integral" | "parcial",
  valorDevolvido: number,
  motivo: string,
): void {
  const valor = arredondar(Math.min(valorDevolvido, venda.valorPago));
  if (valor <= 0) return;
  registrarMovimentacao({
    dataHora: agora(),
    tipo: "cancelamento",
    origem: "cancelamento",
    descricao:
      tipo === "integral"
        ? `Cancelamento da venda ${venda.codigo} · ${venda.clienteNome}`
        : `Devolução parcial da venda ${venda.codigo} · ${venda.clienteNome}`,
    referencia: venda.codigo,
    vendaId: venda.id,
    vendaCodigo: venda.codigo,
    formaPagamento: venda.formaPagamento,
    valor,
    sentido: "saida",
    observacao: motivo,
    motivo,
  });
}
