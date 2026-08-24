import type {
  Caixa,
  MovimentacaoCaixa,
  RecebimentoCaixa,
  ResumoCaixa,
} from "@/types/caixa";
import type { ParcelaVenda, VendaDetalhe } from "@/types/venda";
import { agora, db, gerarId } from "./db";

/**
 * Lançamentos financeiros do caixa.
 *
 * Vive separado do handler HTTP porque o módulo de VENDAS também precisa
 * lançar no caixa (baixa de parcela e devolução) — exatamente como o serviço
 * de vendas do NestJS chamará o serviço de caixa.
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
  const recebimentos = somar(["recebimento_parcela"]);
  const entradasManuais = somar(["entrada"]);
  const saidasManuais = somar(["saida"]);
  const devolucoes = somar(["devolucao", "cancelamento"]);
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
 * Baixa de parcela feita no backoffice → entrada no caixa aberto + recebimento.
 * Quando não existe caixa aberto, nada é lançado (o valor entrará no próximo
 * caixa, pela regra de não alterar histórico já fechado).
 */
export function registrarRecebimentoParcela(
  venda: VendaDetalhe,
  parcela: ParcelaVenda,
  formaPagamento: string,
): void {
  const movimentacao = registrarMovimentacao({
    dataHora: parcela.pagoEm ?? agora(),
    tipo: "recebimento_parcela",
    origem: "parcela",
    descricao: `Recebimento da parcela ${parcela.numero}/${parcela.total} · ${venda.clienteNome}`,
    referencia: venda.codigo,
    vendaId: venda.id,
    vendaCodigo: venda.codigo,
    formaPagamento,
    valor: parcela.valor,
    sentido: "entrada",
    responsavelId: null,
    responsavelNome: "Backoffice",
    observacao: `Baixa registrada no backoffice`,
    motivo: null,
  });
  if (!movimentacao) return;

  const recebimento: RecebimentoCaixa = {
    id: gerarId("rec"),
    dataHora: movimentacao.dataHora,
    vendaId: venda.id,
    vendaCodigo: venda.codigo,
    clienteNome: venda.clienteNome,
    parcelaNumero: parcela.numero,
    parcelaTotal: parcela.total,
    vencimento: parcela.vencimento,
    valor: arredondar(parcela.valor),
    formaPagamento,
    responsavelNome: "Backoffice",
  };
  db.caixasRecebimentos.push(recebimento);
}

/** Cancelamento/devolução → saída no caixa aberto, limitada ao valor recebido. */
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
    tipo: tipo === "integral" ? "cancelamento" : "devolucao",
    origem: tipo === "integral" ? "cancelamento" : "devolucao",
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
    responsavelId: null,
    responsavelNome: "Backoffice",
    observacao: motivo,
    motivo,
  });
}

export function recebimentosDoCaixa(caixa: Caixa): RecebimentoCaixa[] {
  const ids = new Set(
    db.caixasMovimentacoes
      .filter((item) => item.caixaId === caixa.id && item.tipo === "recebimento_parcela")
      .map((item) => `${item.vendaId}-${item.dataHora}`),
  );
  return db.caixasRecebimentos
    .filter((item) => ids.has(`${item.vendaId}-${item.dataHora}`))
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora));
}
